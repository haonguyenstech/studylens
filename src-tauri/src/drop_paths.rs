// Windows: a file dropped on the page is a DOM File with no path. The page posts the files to the app
// with WebView2's postMessageWithAdditionalObjects("studylens:paths:<id>", files); WebView2 hands the
// app each file's path, sent back as the "drop:paths" event. (macOS gets paths from the app's own
// drag-and-drop events instead.)
use serde_json::json;
use tauri::{AppHandle, Emitter, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2, ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs, ICoreWebView2WebMessageReceivedEventArgs2,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows::core::{Interface, PWSTR};

pub fn install(win: &WebviewWindow, app: AppHandle) {
    let _ = win.with_webview(move |wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let app = app.clone();
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_: Option<ICoreWebView2>, args: Option<ICoreWebView2WebMessageReceivedEventArgs>| {
            let Some(args) = args else { return Ok(()) };
            let mut msg = PWSTR::null();
            if args.TryGetWebMessageAsString(&mut msg).is_err() {
                return Ok(());
            }
            let msg = take_pwstr(msg);
            let Some(id) = msg.strip_prefix("studylens:paths:").and_then(|s| s.parse::<u64>().ok()) else { return Ok(()) };
            let mut paths: Vec<String> = vec![];
            if let Ok(args2) = args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>() {
                if let Ok(objs) = args2.AdditionalObjects() {
                    let mut n = 0u32;
                    let _ = objs.Count(&mut n);
                    for i in 0..n {
                        let mut path = String::new();
                        if let Ok(obj) = objs.GetValueAtIndex(i) {
                            if let Ok(file) = obj.cast::<ICoreWebView2File>() {
                                let mut p = PWSTR::null();
                                if file.Path(&mut p).is_ok() {
                                    path = take_pwstr(p);
                                }
                            }
                        }
                        paths.push(path);
                    }
                }
            }
            let _ = app.emit("drop:paths", json!({ "id": id, "paths": paths }));
            Ok(())
        }));
        let mut token = Default::default();
        let _ = core.add_WebMessageReceived(&handler, &mut token);
    });
}
