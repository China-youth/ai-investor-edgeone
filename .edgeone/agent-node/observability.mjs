// src/agent/observability/node/setup.ts
import {
  context as otelContext3,
  trace as otelTrace2,
  SpanStatusCode as SpanStatusCode5
} from "@opentelemetry/api";
import { Resource } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  SimpleSpanProcessor
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// src/agent/observability/node/registry.ts
function assertAtMostOneSpanProcessor(entries) {
  const sps = entries.filter((e) => e.strategy === "spanProcessor");
  if (sps.length > 1) {
    throw new Error(
      `[observability] multiple spanProcessor entries matched (${sps.map((e) => e.name).join(", ")}). Only one spanProcessor strategy is supported per runtime.`
    );
  }
}

// src/agent/observability/node/apm/span-translator.ts
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";

// src/agent/observability/node/apm/llm-semconv.ts
var OI_LLM_KINDS = [
  "LLM",
  "CHAIN",
  "AGENT",
  "TOOL",
  "EMBEDDING",
  "RETRIEVER",
  "RERANKER"
];
var OI_LLM_KIND_SET = new Set(OI_LLM_KINDS);
var OI_LLM_LEAF_KIND_SET = /* @__PURE__ */ new Set(["LLM"]);
function oiKindToOperation(kind) {
  if (kind === "EMBEDDING")
    return "embedding";
  if (kind === "RERANKER")
    return "rerank";
  return "chat";
}
function oiKindToGenaiSpanKind(kind) {
  return kind === "LLM" ? "generation" : kind.toLowerCase();
}
var OI_TO_GENAI_MIRROR = [
  ["gen_ai.usage.prompt_tokens", "llm.token_count.prompt", "number"],
  ["gen_ai.usage.completion_tokens", "llm.token_count.completion", "number"],
  ["llm.usage.total_tokens", "llm.token_count.total", "number"],
  ["gen_ai.usage.input_tokens", "llm.token_count.prompt", "number"],
  ["gen_ai.usage.output_tokens", "llm.token_count.completion", "number"],
  ["gen_ai.usage.total_tokens", "llm.token_count.total", "number"],
  [
    "gen_ai.usage.cache_read.input_tokens",
    "llm.token_count.prompt_details.cache_read",
    "number"
  ],
  ["gen_ai.request.model", "llm.model_name"],
  ["gen_ai.response.model", "llm.model_name"],
  ["gen_ai.system", "llm.provider"],
  ["gen_ai.provider.name", "llm.provider"]
];
function isOpenInferenceLlmSpan(spanAttributes) {
  const kind = spanAttributes["openinference.span.kind"];
  return typeof kind === "string" && OI_LLM_KIND_SET.has(kind);
}
function isLeafLlmSpan(spanAttributes) {
  const kind = spanAttributes["openinference.span.kind"];
  return typeof kind === "string" && OI_LLM_LEAF_KIND_SET.has(kind);
}
function resolveModelName(spanAttributes) {
  for (const key of ["llm.model_name", "gen_ai.response.model", "gen_ai.request.model"]) {
    const v = spanAttributes[key];
    if (typeof v === "string" && v.length > 0)
      return v;
  }
  const raw = spanAttributes["output.value"];
  if (typeof raw === "string" && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      const first = Array.isArray(parsed) ? parsed[0] : parsed;
      if (typeof first?.model === "string" && first.model.length > 0) {
        return first.model;
      }
    } catch {
    }
  }
  return "unknown";
}

// src/agent/observability/node/apm/config.ts
import * as os from "node:os";
var APM_ENDPOINTS = {
  "ap-beijing": "http://ap-beijing.apm.tencentcs.com:55681",
  "ap-singapore": "http://ap-singapore.apm.tencentcs.com:55681"
};
var DEFAULT_REGION = "ap-singapore";
function resolveApmEndpoint() {
  const region = process.env.TENCENTCLOUD_REGION ?? DEFAULT_REGION;
  return APM_ENDPOINTS[region] ?? APM_ENDPOINTS[DEFAULT_REGION];
}
var _cachedDevServiceName = null;
function resolveServiceName() {
  const projectId = process.env.PAGES_PROJECT_ID;
  const deploymentId = process.env.PAGES_DEPLOYMENT_ID;
  if (projectId && deploymentId) {
    return `${projectId}-${deploymentId}`;
  }
  if (process.env.OTEL_SERVICE_NAME) {
    return process.env.OTEL_SERVICE_NAME;
  }
  if (process.env.EDGEONE_DEV_SERVICE_NAME) {
    return process.env.EDGEONE_DEV_SERVICE_NAME;
  }
  if (!_cachedDevServiceName) {
    const basename = process.cwd().split(/[\\/]/).filter(Boolean).pop() || "agent";
    const now = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    _cachedDevServiceName = `${basename}-${dateStr}`;
  }
  return _cachedDevServiceName;
}
var MIN_LLM_CALL_DURATION_MS = 50;
var METRIC_EXPORT_INTERVAL_MS = 3e5;
var METRIC_EXPORT_TIMEOUT_MS = 3e4;
var OBSERVABILITY_VERSION = "0.1.0";
var APM_IDENTITY_LIBRARY_NAME = "langfuse-sdk";
var APM_IDENTITY_LIBRARY_VERSION = "4.3.1";
var _cachedIdentityAttrs = null;
function apmIdentityAttrs() {
  if (_cachedIdentityAttrs)
    return _cachedIdentityAttrs;
  _cachedIdentityAttrs = {
    "instrumentation.library.name": APM_IDENTITY_LIBRARY_NAME,
    "instrumentation.library.version": APM_IDENTITY_LIBRARY_VERSION,
    "host.name": os.hostname(),
    ip: getLocalIp(),
    "service.instance": os.hostname()
  };
  return _cachedIdentityAttrs;
}
function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] ?? []) {
      if (iface.family === "IPv4" && !iface.internal)
        return iface.address;
    }
  }
  return "127.0.0.1";
}

// src/agent/observability/node/apm/span-translator.ts
var INTERRUPT_EXCEPTION_NAMES = /* @__PURE__ */ new Set([
  "GraphInterrupt",
  "NodeInterrupt",
  "ParentCommand"
]);
function matchesInterruptName(value) {
  if (typeof value !== "string" || value.length === 0)
    return false;
  const last = value.split(".").pop() ?? value;
  return INTERRUPT_EXCEPTION_NAMES.has(last);
}
function isInterruptSpan(span) {
  const attrs = span.attributes;
  if (matchesInterruptName(attrs["exception.type"]))
    return true;
  if (matchesInterruptName(attrs["error.type"]))
    return true;
  for (const ev of span.events ?? []) {
    if (ev.name !== "exception")
      continue;
    if (matchesInterruptName(ev.attributes?.["exception.type"]))
      return true;
  }
  return false;
}
function attr(span, key) {
  const v = span.attributes[key];
  if (v === void 0 || v === null)
    return void 0;
  return String(v);
}
function checkIsOiLlmSpan(span) {
  return isOpenInferenceLlmSpan(span.attributes);
}
function isTraceEntry(span, ctx) {
  const parent = span.parentSpanId;
  if (!parent)
    return true;
  if (ctx.isRootSpanId(parent))
    return true;
  return false;
}
function genAiMirror(src) {
  const out = {};
  for (const [destKey, srcKey, coerce] of OI_TO_GENAI_MIRROR) {
    if (destKey in src)
      continue;
    const v = src[srcKey];
    if (v === void 0 || v === null)
      continue;
    if (coerce === "number") {
      const n = Number(v);
      if (!Number.isFinite(n))
        continue;
      out[destKey] = n;
    } else {
      out[destKey] = String(v);
    }
  }
  const oiKind = src["openinference.span.kind"];
  if (typeof oiKind === "string") {
    const mapped = oiKindToOperation(oiKind);
    if (!("llm.request.type" in src))
      out["llm.request.type"] = mapped;
    if (!("gen_ai.operation.name" in src))
      out["gen_ai.operation.name"] = mapped;
    if (!("gen_ai.span.kind" in src)) {
      out["gen_ai.span.kind"] = oiKindToGenaiSpanKind(oiKind);
    }
  }
  return out;
}
function prefixAttrs(attrs) {
  const out = {};
  for (const [key, val] of Object.entries(attrs)) {
    out[`langfuse.${key}`] = val;
  }
  return out;
}
function translateSpan(span, ctx) {
  const model = resolveModelName(span.attributes);
  const provider = attr(span, "llm.provider") ?? "unknown";
  const oiKind = attr(span, "openinference.span.kind") ?? "unknown";
  const genAi = genAiMirror(span.attributes);
  if (model !== "unknown") {
    if (!genAi["gen_ai.response.model"])
      genAi["gen_ai.response.model"] = model;
    if (!genAi["gen_ai.request.model"])
      genAi["gen_ai.request.model"] = model;
    if (!span.attributes["llm.model_name"])
      span.attributes["llm.model_name"] = model;
  }
  const entryAttr = isTraceEntry(span, ctx) && !("gen_ai.is_entry" in span.attributes) ? { "gen_ai.is_entry": true } : {};
  const mergedAttrs = {
    ...prefixAttrs(span.attributes),
    custom_key_1: model,
    custom_key_2: provider,
    custom_key_3: oiKind,
    ...genAi,
    ...entryAttr
  };
  const identity = apmIdentityAttrs();
  for (const k in identity) {
    if (!(k in mergedAttrs)) {
      mergedAttrs[k] = identity[k];
    }
  }
  const impersonatedLib = {
    name: APM_IDENTITY_LIBRARY_NAME,
    version: APM_IDENTITY_LIBRARY_VERSION
  };
  let normalisedStatus = span.status?.code === SpanStatusCode.OK ? { code: SpanStatusCode.UNSET } : span.status;
  if (normalisedStatus?.code === SpanStatusCode.ERROR && isInterruptSpan(span)) {
    normalisedStatus = { code: SpanStatusCode.UNSET };
    mergedAttrs["agent.interrupt"] = true;
    mergedAttrs["langfuse.agent.interrupt"] = true;
  }
  const translated = Object.create(
    Object.getPrototypeOf(span),
    {
      name: { value: span.name, enumerable: true },
      kind: { value: SpanKind.INTERNAL, enumerable: true },
      spanContext: { value: span.spanContext.bind(span), enumerable: true },
      parentSpanId: { value: span.parentSpanId, enumerable: true },
      startTime: { value: span.startTime, enumerable: true },
      endTime: { value: span.endTime, enumerable: true },
      status: { value: normalisedStatus, enumerable: true },
      attributes: { value: mergedAttrs, enumerable: true },
      links: { value: span.links, enumerable: true },
      events: { value: span.events, enumerable: true },
      duration: { value: span.duration, enumerable: true },
      ended: { value: span.ended, enumerable: true },
      resource: { value: span.resource, enumerable: true },
      instrumentationLibrary: {
        value: impersonatedLib,
        enumerable: true
      },
      droppedAttributesCount: {
        value: span.droppedAttributesCount,
        enumerable: true
      },
      droppedEventsCount: { value: span.droppedEventsCount, enumerable: true },
      droppedLinksCount: { value: span.droppedLinksCount, enumerable: true }
    }
  );
  return translated;
}
function prefixOnlySpan(span, ctx) {
  const mergedAttrs = prefixAttrs(span.attributes);
  const spanId = span.spanContext().spanId;
  if (ctx.isRootSpanId(spanId) && ctx.rootSpanHasChildren(spanId)) {
    mergedAttrs["gen_ai.is_entry"] = true;
  }
  let status = span.status;
  if (status?.code === SpanStatusCode.ERROR && isInterruptSpan(span)) {
    status = { code: SpanStatusCode.UNSET };
    mergedAttrs["agent.interrupt"] = true;
    mergedAttrs["langfuse.agent.interrupt"] = true;
  }
  return Object.create(
    Object.getPrototypeOf(span),
    {
      name: { value: span.name, enumerable: true },
      kind: { value: span.kind, enumerable: true },
      spanContext: { value: span.spanContext.bind(span), enumerable: true },
      parentSpanId: { value: span.parentSpanId, enumerable: true },
      startTime: { value: span.startTime, enumerable: true },
      endTime: { value: span.endTime, enumerable: true },
      status: { value: status, enumerable: true },
      attributes: { value: mergedAttrs, enumerable: true },
      links: { value: span.links, enumerable: true },
      events: { value: span.events, enumerable: true },
      duration: { value: span.duration, enumerable: true },
      ended: { value: span.ended, enumerable: true },
      resource: { value: span.resource, enumerable: true },
      instrumentationLibrary: { value: span.instrumentationLibrary, enumerable: true },
      droppedAttributesCount: { value: span.droppedAttributesCount, enumerable: true },
      droppedEventsCount: { value: span.droppedEventsCount, enumerable: true },
      droppedLinksCount: { value: span.droppedLinksCount, enumerable: true }
    }
  );
}
function wrapExporterForApm(inner, ctx) {
  return {
    export(spans, resultCallback) {
      const translated = spans.map(
        (s) => checkIsOiLlmSpan(s) ? translateSpan(s, ctx) : prefixOnlySpan(s, ctx)
      );
      inner.export(translated, resultCallback);
    },
    shutdown() {
      return inner.shutdown();
    },
    forceFlush() {
      return inner.forceFlush ? inner.forceFlush() : Promise.resolve();
    }
  };
}

// src/agent/observability/node/apm/metrics-bridge.ts
import { diag, SpanStatusCode as SpanStatusCode2 } from "@opentelemetry/api";
import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader
} from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
function pickString(span, ...keys) {
  for (const k of keys) {
    const v = span.attributes[k];
    if (typeof v === "string" && v.length > 0)
      return v;
  }
  return void 0;
}
var INTERRUPT_EXCEPTION_NAMES2 = /* @__PURE__ */ new Set([
  "GraphInterrupt",
  "NodeInterrupt",
  "ParentCommand"
]);
function matchesInterruptName2(value) {
  if (typeof value !== "string" || value.length === 0)
    return false;
  const last = value.split(".").pop() ?? value;
  return INTERRUPT_EXCEPTION_NAMES2.has(last);
}
function isInterruptSpan2(span) {
  if (matchesInterruptName2(span.attributes["exception.type"]))
    return true;
  if (matchesInterruptName2(span.attributes["error.type"]))
    return true;
  for (const ev of span.events ?? []) {
    if (ev.name !== "exception")
      continue;
    if (matchesInterruptName2(ev.attributes?.["exception.type"]))
      return true;
  }
  return false;
}
function sharedAttrs(span) {
  const model = resolveModelName(span.attributes);
  const system = pickString(span, "llm.provider", "gen_ai.system", "gen_ai.provider.name") ?? "unknown";
  const oiKind = pickString(span, "openinference.span.kind") ?? "";
  const requestType = pickString(span, "llm.request.type") ?? oiKindToOperation(oiKind);
  const out = {
    "gen_ai.system": system,
    "gen_ai.response.model": model,
    "gen_ai.operation.name": requestType
  };
  const streaming = span.attributes["llm.is_streaming"];
  if (streaming === true || streaming === "true") {
    out["stream"] = true;
  }
  return out;
}
function isLeafLlmSpan2(span) {
  return isLeafLlmSpan(span.attributes);
}
function spanDurationSeconds(span) {
  const [s, ns] = span.duration;
  return s + ns / 1e9;
}
function setupApmMetricsBridge(opts) {
  const exporter = new OTLPMetricExporter({
    url: `${opts.endpoint.replace(/\/$/, "")}/v1/metrics`,
    temporalityPreference: AggregationTemporality.DELTA
  });
  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: METRIC_EXPORT_INTERVAL_MS,
    exportTimeoutMillis: METRIC_EXPORT_TIMEOUT_MS
  });
  const meterProvider = new MeterProvider({
    resource: opts.resource,
    readers: [reader]
  });
  const meter = meterProvider.getMeter(
    "edgeone-agent-observability-apm-bridge",
    OBSERVABILITY_VERSION
  );
  const durationHistogram = meter.createHistogram(
    "gen_ai.client.operation.duration",
    { unit: "s", description: "GenAI operation duration" }
  );
  function recordSpan(span) {
    if (!isLeafLlmSpan2(span))
      return;
    const durSec = spanDurationSeconds(span);
    if (durSec * 1e3 < MIN_LLM_CALL_DURATION_MS)
      return;
    const attrs = {
      ...sharedAttrs(span)
    };
    if (span.status?.code === SpanStatusCode2.ERROR && !isInterruptSpan2(span)) {
      attrs["error.type"] = pickString(span, "error.type", "exception.type") ?? "error";
    }
    durationHistogram.record(durSec, attrs);
  }
  const spanProcessor = {
    forceFlush() {
      return Promise.resolve();
    },
    onStart() {
    },
    onEnd(span) {
      try {
        recordSpan(span);
      } catch (err) {
        diag.debug(
          `[apm-metrics-bridge] recordSpan failed: ${err.message}`
        );
      }
    },
    shutdown() {
      return meterProvider.shutdown();
    }
  };
  async function shutdown() {
    await meterProvider.shutdown();
  }
  return { meterProvider, spanProcessor, shutdown };
}

// src/agent/observability/node/activate.ts
import { registerInstrumentations } from "@opentelemetry/instrumentation";
async function activateEntry(entry, provider) {
  if (entry.strategy === "spanProcessor")
    return;
  const module = await import(entry.instrumentationPackage);
  const Ctor = module[entry.instrumentationExport];
  if (typeof Ctor !== "function") {
    throw new Error(
      `[observability] '${entry.instrumentationPackage}' has no export '${entry.instrumentationExport}'`
    );
  }
  if (entry.strategy === "manual") {
    if (!entry.targetModule) {
      throw new Error(
        `[observability] entry '${entry.name}' is strategy=manual but has no targetModule`
      );
    }
    const target = await import(entry.targetModule);
    const instr = new Ctor({ tracerProvider: provider });
    instr.manuallyInstrument(target);
  } else {
    registerInstrumentations({
      tracerProvider: provider,
      instrumentations: [new Ctor({ tracerProvider: provider })]
    });
  }
}

// src/agent/observability/node/context-propagator.ts
import { AsyncLocalStorage } from "node:async_hooks";
var requestContextStorage = new AsyncLocalStorage();
async function runWithAgentContextAsync(ctx, fn) {
  return requestContextStorage.run(ctx, fn);
}
var AgentContextPropagator = class {
  forceFlush() {
    return Promise.resolve();
  }
  onStart(span, _parentContext) {
    const traceId = span.spanContext().traceId;
    if (traceId) {
      span.setAttribute("agent.run_id", traceId);
    }
    const agentCtx = requestContextStorage.getStore();
    if (agentCtx) {
      span.setAttribute("agent.conversation_id", agentCtx.conversation_id);
    }
  }
  onEnd(_span) {
  }
  shutdown() {
    return Promise.resolve();
  }
};

// src/agent/observability/node/context-propagation.ts
import {
  context as otelContext,
  SpanStatusCode as SpanStatusCode3
} from "@opentelemetry/api";
async function withContextAsync(ctx, fn) {
  return otelContext.with(ctx, fn);
}
function endSpanOk(span) {
  span.setStatus({ code: SpanStatusCode3.OK });
  span.end();
}
function endSpanError(span, error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode3.ERROR, message: error.message });
  span.end();
}

// src/agent/observability/node/user-tracer.ts
import {
  context as otelContext2,
  trace as otelTrace,
  SpanStatusCode as SpanStatusCode4
} from "@opentelemetry/api";
var INTERRUPT_ERROR_NAMES = /* @__PURE__ */ new Set([
  "GraphInterrupt",
  "NodeInterrupt",
  "ParentCommand"
]);
function isInterruptError(err) {
  if (err === null || err === void 0)
    return false;
  const name = err?.name ?? err?.constructor?.name;
  return typeof name === "string" && INTERRUPT_ERROR_NAMES.has(name);
}
function wrapSpan(span) {
  return {
    spanId: span.spanContext().spanId,
    setAttribute(key, value) {
      span.setAttribute(key, value);
    },
    setAttributes(attributes) {
      span.setAttributes(attributes);
    },
    end() {
      span.end();
    }
  };
}
var cachedTracer = null;
function createUserTracer() {
  if (cachedTracer)
    return cachedTracer;
  const tracer = otelTrace.getTracer("edgeone-agent-user", OBSERVABILITY_VERSION);
  cachedTracer = {
    startSpan(name, attributes) {
      const parentCtx = otelContext2.active();
      const span = tracer.startSpan(name, { attributes }, parentCtx);
      return wrapSpan(span);
    },
    async span(name, fn, attributes) {
      const parentCtx = otelContext2.active();
      const span = tracer.startSpan(name, { attributes }, parentCtx);
      const spanCtx = otelTrace.setSpan(parentCtx, span);
      return otelContext2.with(spanCtx, async () => {
        try {
          const result = await fn(wrapSpan(span));
          span.end();
          return result;
        } catch (err) {
          if (isInterruptError(err)) {
            const errName = err?.name ?? err?.constructor?.name ?? "Interrupt";
            span.setAttribute("agent.interrupt", true);
            span.setAttribute("agent.interrupt.type", errName);
          } else {
            span.recordException(err instanceof Error ? err : new Error(String(err)));
            span.setStatus({
              code: SpanStatusCode4.ERROR,
              message: err instanceof Error ? err.message : String(err)
            });
          }
          span.end();
          throw err;
        }
      });
    },
    setAttributes(attributes) {
      const activeSpan = otelTrace.getSpan(otelContext2.active());
      if (activeSpan) {
        activeSpan.setAttributes(attributes);
      }
    }
  };
  return cachedTracer;
}

// src/agent/observability/node/setup.ts
var globalHandle = null;
async function setup(options = {}) {
  if (globalHandle)
    return globalHandle;
  const endpoint = options.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? resolveApmEndpoint();
  const serviceName = options.serviceName ?? resolveServiceName();
  const environment = options.environment ?? process.env.NODE_ENV ?? "development";
  const apmToken = options.apmToken ?? process.env.SVC_TRACE_KEY_LB6V03 ?? "";
  const entries = options.entries ?? [];
  const devApmToken = process.env.EDGEONE_DEV_APM_TOKEN;
  const resource = Resource.default().merge(
    new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      "deployment.environment": environment,
      token: devApmToken || apmToken
    })
  );
  const rawExporter = new OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, "")}/v1/traces`
  });
  const rootSpanIds = /* @__PURE__ */ new Set();
  const rootSpansWithChildren = /* @__PURE__ */ new Set();
  const translatorCtx = {
    isRootSpanId: (id) => rootSpanIds.has(id),
    rootSpanHasChildren: (id) => rootSpansWithChildren.has(id)
  };
  const exporter = wrapExporterForApm(rawExporter, translatorCtx);
  const devApmEndpoint = process.env.EDGEONE_DEV_APM_ENDPOINT ?? resolveApmEndpoint();
  let devApmProcessor = null;
  if (devApmToken) {
    const apmUrl = `${devApmEndpoint.replace(/\/$/, "")}/v1/traces`;
    const apmExporter = new OTLPTraceExporter({ url: apmUrl });
    devApmProcessor = new SimpleSpanProcessor(wrapExporterForApm(apmExporter, translatorCtx));
    console.log(`[observability] APM dual-export enabled \u2192 ${devApmEndpoint}`);
  }
  assertAtMostOneSpanProcessor(entries);
  const spanProcessorEntries = entries.filter((e) => e.strategy === "spanProcessor");
  const spanProcessors = [];
  let installedSpanProcessorEntry = null;
  if (spanProcessorEntries.length === 1) {
    const entry = spanProcessorEntries[0];
    try {
      const mod = await import(entry.instrumentationPackage);
      const Ctor = mod[entry.instrumentationExport];
      if (typeof Ctor === "function") {
        spanProcessors.push(new Ctor({ exporter }));
        installedSpanProcessorEntry = entry;
      }
    } catch {
      spanProcessors.push(new SimpleSpanProcessor(exporter));
    }
  } else {
    spanProcessors.push(new SimpleSpanProcessor(exporter));
  }
  if (devApmProcessor) {
    spanProcessors.push(devApmProcessor);
  }
  const metricsBridge = setupApmMetricsBridge({ endpoint: devApmToken ? devApmEndpoint : endpoint, apmToken: devApmToken || apmToken, resource });
  spanProcessors.push(metricsBridge.spanProcessor);
  spanProcessors.push(new AgentContextPropagator());
  const traceHasError = /* @__PURE__ */ new Set();
  spanProcessors.push({
    forceFlush: () => Promise.resolve(),
    onStart(span) {
      const parentId = span.parentSpanId;
      if (parentId && rootSpanIds.has(parentId)) {
        rootSpansWithChildren.add(parentId);
      }
    },
    onEnd(span) {
      const id = span.spanContext().spanId;
      const traceId = span.spanContext().traceId;
      if (!rootSpanIds.has(id) && span.status?.code === SpanStatusCode5.ERROR && isOpenInferenceLlmSpan(span.attributes)) {
        traceHasError.add(traceId);
      }
      if (rootSpanIds.has(id)) {
        traceHasError.delete(traceId);
        rootSpanIds.delete(id);
        rootSpansWithChildren.delete(id);
      }
    },
    shutdown: () => Promise.resolve()
  });
  const provider = new NodeTracerProvider({ resource, spanProcessors });
  provider.register();
  const otelTracer = provider.getTracer("edgeone-agent-observability", OBSERVABILITY_VERSION);
  const activatedNames = [];
  if (installedSpanProcessorEntry) {
    activatedNames.push(installedSpanProcessorEntry.name);
  }
  for (const entry of entries) {
    if (entry.strategy === "spanProcessor")
      continue;
    try {
      await activateEntry(entry, provider);
      activatedNames.push(entry.name);
    } catch (err) {
      console.warn(`[observability] failed to activate ${entry.name}: ${err.message}`);
    }
  }
  if (activatedNames.length > 0) {
    console.log(`[observability] enabled: ${activatedNames.join(", ")}`);
  }
  const tracer = {
    startSpan(opts) {
      const parentCtx = opts.parentContext ?? otelContext3.active();
      const span = otelTracer.startSpan(opts.name, { attributes: opts.attributes }, parentCtx);
      const ctx = otelTrace2.setSpan(parentCtx, span);
      rootSpanIds.add(span.spanContext().spanId);
      return { span, ctx };
    },
    endSpanOk(span) {
      const s = span;
      const traceId = s.spanContext().traceId;
      if (traceHasError.has(traceId)) {
        endSpanError(s, new Error("child span error"));
      } else {
        endSpanOk(s);
      }
    },
    endSpanError(span, error) {
      endSpanError(span, error);
    },
    withContext(ctx, agentContext, fn) {
      return withContextAsync(
        ctx,
        () => runWithAgentContextAsync(agentContext, fn)
      );
    },
    createUserTracer() {
      return createUserTracer();
    }
  };
  let shuttingDown = false;
  async function shutdown(_reason) {
    if (shuttingDown)
      return;
    shuttingDown = true;
    rootSpanIds.clear();
    rootSpansWithChildren.clear();
    try {
      await metricsBridge.shutdown();
      await provider.shutdown();
    } catch {
    }
    globalHandle = null;
  }
  globalHandle = { tracer, shutdown };
  return globalHandle;
}
export {
  setup
};
