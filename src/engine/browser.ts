// The engine inside the app window: the Rust side sends "engine:call" events, the answer goes back
// with the engine_reply command. Files are read through the app (engine_read), which only hands out
// the files of the job being checked.
import { check, CheckRequest, Host, officeText } from "./index";
import { renderMermaid } from "./diagrams";

interface Tauri {
  core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> };
  event: { listen<T>(name: string, cb: (e: { payload: T }) => void): Promise<() => void> };
}
const tauri = (window as unknown as { __TAURI__: Tauri }).__TAURI__;

const host: Host = {
  readBytes: async (path) => new Uint8Array(await tauri.core.invoke<ArrayBuffer>("engine_read", { path })),
  draw: renderMermaid,
};

const methods: Record<string, (args: any) => Promise<unknown>> = {
  check: (req: CheckRequest) => check(req, host),
  officeText: (req) => officeText(req, host),
};

// Ask AI draws the ```mermaid blocks of an answer with the same renderer.
(window as unknown as { studylensDraw: typeof renderMermaid }).studylensDraw = renderMermaid;

interface Call { id: number; method: string; args: unknown }

tauri.event.listen<Call>("engine:call", async ({ payload: { id, method, args } }) => {
  try {
    const fn = methods[method];
    if (!fn) throw new Error(`unknown engine method ${method}`);
    await tauri.core.invoke("engine_reply", { id, ok: true, value: await fn(args) });
  } catch (e) {
    await tauri.core.invoke("engine_reply", { id, ok: false, value: String((e as Error)?.message ?? e) });
  }
}).then(() => tauri.core.invoke("engine_ready"));
