import { createRequire as __edgeoneCreateRequire } from 'module';
const require = __edgeoneCreateRequire(import.meta.url);

import { setup } from './observability.mjs';

const __eo_obs = await setup({ entries: [{"name":"openai-agents","strategy":"manual","instrumentationPackage":"@edgeone/openinference-instrumentation-openai-agents","instrumentationExport":"OpenAIAgentsInstrumentation","targetModule":"@openai/agents","specifiers":{"exact":["@openai/agents"],"prefix":["@openai/agents/"]}}] }).catch((err) => {
  console.warn('[observability] setup failed, tracing disabled:', err.message);
  return null;
});
if (__eo_obs) {
  globalThis.__EDGEONE_AGENT_TRACER__ = __eo_obs.tracer;
  globalThis.__EDGEONE_OBSERVABILITY_SHUTDOWN__ = (reason) => __eo_obs.shutdown(reason);
}
await import('./server.mjs');
