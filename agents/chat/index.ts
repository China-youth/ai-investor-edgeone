import { run, Agent } from '@openai/agents';
import { OpenAIProvider } from '@openai/agents-openai';
import { createLogger, sseEvent, createSSEResponse } from '../_shared';

const logger = createLogger('investor-chat');

const SYSTEM_PROMPT = `你是一位见过太多项目的资深投资人，说话毒舌、判断犀利，不给人留情面。用户来找你，是想让你评估他们的副业想法。

## 你的分析框架
每次用户描述完副业想法后，你必须按以下结构输出：

### 1. 毒舌点评（开场）
- 直接指出这个idea最致命的问题
- 说话要毒舌、犀利，但必须有专业依据，不能只是骂人
- 可以用比喻、反讽，但要让用户感到"被戳中了"

### 2. 投资判断（核心）
- 给出你愿意投资多少钱的具体判断
- 投资金额范围：0 ~ 1000万人民币
- 如果项目很烂，可以直接说"白送都不要"或"这项目给我，我连夜扛着火车跑"
- 如果项目不错，给具体数字（如"我愿意投50万"）并说明占股预期
- 用投资术语（pre-money估值、天使轮、种子轮等）

### 3. 判断理由（深度分析）
从以下维度分析，不需要全部覆盖，挑最关键的2-3个说透：
- 市场规模（TAM/SAM/SOM）
- 竞争格局和壁垒
- 变现路径清晰度
- 用户获取成本（CAC）vs 用户生命周期价值（LTV）
- 启动门槛和可复制性
- 团队匹配度（从用户描述中推断）
- 政策/合规风险

### 4. 改进建议（actionable）
- 给出2-3条具体可执行的改进建议
- 如果项目彻底没救，直接说"建议放弃，换个方向"
- 建议要有针对性，不能是泛泛而谈的"要好好学习"

## 重要提醒
- 保持毒舌人设，但分析要有深度和专业度
- 投资金额必须具体，不能用"一些""不少"这种模糊词
- 你是在进行多轮对话，用户会根据你的反馈调整方案继续追问
- 使用 web_search 工具搜索最新的竞品和市场信息
- 如果用户只是打招呼或闲聊，毒舌回应然后引导他们描述副业想法
- 回复用中文，可以夹杂少量英文投资术语`;

export async function onRequest(context: any) {
  const body = (context.request.body ?? {}) as Record<string, unknown>;
  const message = body.message as string | undefined;
  const history = body.history as Array<{ role: string; content: string }> | undefined;

  logger.info('=== Chat endpoint called ===');
  logger.info('Message:', message?.slice(0, 100));
  logger.info('History length:', history?.length);
  logger.info('Context keys:', Object.keys(context));
  logger.info('Context tools:', context.tools ? 'exists' : 'undefined');
  logger.info('Context env:', context.env);

  if (!message) {
    return new Response(JSON.stringify({ error: "'message' is required" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const signal = context.request.signal as AbortSignal | undefined;
  const env = (context.env ?? {}) as Record<string, string | undefined>;

  // Build provider connected to EdgeOne AI Gateway
  logger.info('Creating provider with API key:', env.AI_GATEWAY_API_KEY?.substring(0, 10) + '...');
  logger.info('Base URL:', env.AI_GATEWAY_BASE_URL);

  const provider = new OpenAIProvider({
    apiKey: env.AI_GATEWAY_API_KEY,
    baseURL: env.AI_GATEWAY_BASE_URL,
  });

  const modelName = env.AI_GATEWAY_MODEL ?? '@makers/hy3-preview';
  logger.info('Model name:', modelName);

  // Get tools from context - web_search if WSA_API_KEY is available
  // ⚠️ 二分法排查：默认不挂任何平台工具（USE_PLATFORM_TOOLS=1 时才启用 14 个内置工具）
  // 原因：怀疑 @makers/hy3-preview 不支持 strict 工具格式导致空流
  const usePlatformTools = env.USE_PLATFORM_TOOLS === '1';
  let tools: any[] = [];
  if (usePlatformTools && context.tools) {
    try {
      tools = context.tools.all();
      logger.info('Tools retrieved, count:', tools.length);
      if (tools.length > 0) {
        logger.info('First tool name:', tools[0].name);
      }
    } catch (toolError) {
      logger.error('Failed to get tools:', toolError);
    }
  } else if (usePlatformTools) {
    logger.warn('USE_PLATFORM_TOOLS=1 but context.tools is undefined');
  } else {
    logger.info('Tools disabled for bisect (USE_PLATFORM_TOOLS not set), running with tools=[]');
  }

  const agent = new Agent({
    name: '毒舌投资人',
    instructions: SYSTEM_PROMPT,
    model: modelName,
    modelProvider: provider,
    tools: tools,
  });

  logger.info('Agent created, starting run...');

  // Build conversation items
  const items: Array<Record<string, unknown>> = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg.role === 'user') {
        items.push({ type: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        items.push({ type: 'assistant', content: msg.content });
      }
    }
  }

  // Add current message
  items.push({ type: 'user', content: message });

  logger.info('Running agent with', items.length, 'items');

  return createSSEResponse(
    async function* () {
      let textBuffer = '';
      try {
        logger.info('Starting agent run...');
        const result = await run(agent, items as any, { stream: true, signal });
        logger.info('Agent run completed, processing events...');

        let eventCount = 0;
        for await (const event of result) {
          if (signal?.aborted) {
            logger.info('Signal aborted');
            break;
          }
          eventCount++;

          logger.info('Event', eventCount, 'type:', event.type);

          // Handle raw model stream events
          if (event.type === 'raw_model_stream_event') {
            const data = event.data as any;
            logger.info('Raw event data type:', data?.type);
            if (data?.type === 'output_text_delta') {
              const delta = data.delta as string;
              if (delta) {
                textBuffer += delta;
                yield sseEvent({ type: 'ai_response', data: { content: delta } });
              }
            }
          }

          // Handle item stream events (tool calls, etc.)
          if (event.type === 'run_item_stream_event') {
            const eventName = event.name;
            logger.info('Item event name:', eventName);

            if (eventName === 'tool_called') {
              const toolName = event.item?.name ?? event.item?.rawItem?.name;
              if (toolName) {
                logger.info('Tool called:', toolName);
                yield sseEvent({ type: 'tool_call', data: { name: toolName } });
              }
            }
            if (eventName === 'tool_output') {
              const toolName = event.item?.name ?? event.item?.rawItem?.name;
              const out = event.item?.output ?? event.item?.rawItem?.output;
              const content = typeof out === 'string' ? out.slice(0, 500) : JSON.stringify(out).slice(0, 500);
              logger.info('Tool output:', toolName, content.slice(0, 100));
              yield sseEvent({ type: 'tool_result', data: { name: toolName, content } });
            }
          }

          // Handle agent updates (handoffs)
          if (event.type === 'agent_updated_stream_event') {
            const agentName = event.agent?.name;
            if (agentName) {
              logger.info('Agent updated to:', agentName);
              yield sseEvent({ type: 'tool_call', data: { name: `handoff:${agentName}` } });
            }
          }
        }
        logger.info('Total events processed:', eventCount, 'text length:', textBuffer.length);

        // 防御：流正常结束但模型一个字都没吐 → 向前端显式报错，而不是空气泡
        if (textBuffer.length === 0) {
          const msg = `模型(${modelName})未返回任何内容。本次运行 tools 数量: ${tools.length}，事件数: ${eventCount}。若 tools>0，大概率是该模型不支持当前工具格式。`;
          logger.error('Empty response detected:', msg);
          yield sseEvent({ type: 'error_message', content: msg });
        }
      } catch (e) {
        const err = e as Error;
        logger.error('Agent run error:', err.message);
        logger.error('Error stack:', err.stack);

        if (err.name === 'AbortError' || signal?.aborted) {
          logger.info('Request aborted');
          return;
        }
        yield sseEvent({ type: 'error_message', content: err.message });
      }
    },
    signal,
  );
}
