// macOS: Tauri's file-drop handler takes every drag that enters the WebView (it always reports the
// drag as handled), so the page's own HTML drag and drop (notebooks onto projects, reordering files)
// never reaches WebKit. Here the WebView's dragging methods are re-pointed: a drag that started in
// this app (it has a dragging source) goes to WebKit, anything else (files from Finder) to Tauri as before.
use objc2::ffi;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{msg_send, sel};
use std::sync::OnceLock;
use tauri::WebviewWindow;

type OpFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> usize;
type BoolFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> bool;
type VoidFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject);

/// (Tauri's implementation, WebKit's) for each selector.
struct Imps {
    entered: (OpFn, OpFn),
    updated: (OpFn, OpFn),
    perform: (BoolFn, BoolFn),
    exited: (VoidFn, VoidFn),
}
static IMPS: OnceLock<Imps> = OnceLock::new();

unsafe fn from_app(info: *mut AnyObject) -> bool {
    let source: *mut AnyObject = msg_send![info, draggingSource];
    !source.is_null()
}

unsafe extern "C-unwind" fn entered(this: *mut AnyObject, s: Sel, info: *mut AnyObject) -> usize {
    let (tauri, webkit) = IMPS.get().unwrap().entered;
    if from_app(info) { webkit(this, s, info) } else { tauri(this, s, info) }
}
unsafe extern "C-unwind" fn updated(this: *mut AnyObject, s: Sel, info: *mut AnyObject) -> usize {
    let (tauri, webkit) = IMPS.get().unwrap().updated;
    if from_app(info) { webkit(this, s, info) } else { tauri(this, s, info) }
}
unsafe extern "C-unwind" fn perform(this: *mut AnyObject, s: Sel, info: *mut AnyObject) -> bool {
    let (tauri, webkit) = IMPS.get().unwrap().perform;
    if from_app(info) { webkit(this, s, info) } else { tauri(this, s, info) }
}
unsafe extern "C-unwind" fn exited(this: *mut AnyObject, s: Sel, info: *mut AnyObject) {
    let (tauri, webkit) = IMPS.get().unwrap().exited;
    if info.is_null() || !from_app(info) { tauri(this, s, info) } else { webkit(this, s, info) }
}

pub fn install(win: &WebviewWindow) {
    let _ = win.with_webview(|wv| unsafe {
        let view = wv.inner() as *const AnyObject;
        let cls = ffi::object_getClass(view);
        let Some(webkit_cls) = AnyClass::get(c"WKWebView") else { return };
        if cls.is_null() || std::ptr::eq(cls, webkit_cls) || IMPS.get().is_some() {
            return; // not Tauri's subclass, or already done
        }
        let imp = |c: *const AnyClass, s: Sel| -> Option<Imp> { ffi::method_getImplementation(ffi::class_getInstanceMethod(c, s)) };
        let mut found = vec![];
        for s in [sel!(draggingEntered:), sel!(draggingUpdated:), sel!(performDragOperation:), sel!(draggingExited:)] {
            let (Some(t), Some(w)) = (imp(cls, s), imp(webkit_cls, s)) else { return };
            found.push((t, w));
        }
        use std::mem::transmute as t;
        let _ = IMPS.set(Imps {
            entered: (t(found[0].0), t(found[0].1)),
            updated: (t(found[1].0), t(found[1].1)),
            perform: (t(found[2].0), t(found[2].1)),
            exited: (t(found[3].0), t(found[3].1)),
        });
        let set = |s: Sel, f: Imp| { ffi::method_setImplementation(ffi::class_getInstanceMethod(cls, s), f); };
        set(sel!(draggingEntered:), t::<OpFn, Imp>(entered));
        set(sel!(draggingUpdated:), t::<OpFn, Imp>(updated));
        set(sel!(performDragOperation:), t::<BoolFn, Imp>(perform));
        set(sel!(draggingExited:), t::<VoidFn, Imp>(exited));
    });
}
