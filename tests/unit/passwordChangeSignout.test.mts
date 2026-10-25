import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React, { act } from "react";
import * as sessionState from "../../context/authSessionState";
import { getPasswordUpdateErrorMessage } from "../../lib/settingsPasswordError";
import { safeRedirectPath } from "../../lib/safeRedirect";

const require = createRequire(import.meta.url);
function load<T>(file: string, mocks: Record<string, unknown>): T {
    const { outputText } = ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}});
    const loaded = {exports:{}};
    new Function("require","module","exports",outputText)((name:string)=>name in mocks ? mocks[name] : require(name),loaded,loaded.exports);
    return loaded.exports as T;
}
function deferred<T>() {let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject};}
const name="jsdom";
const {JSDOM}=await import(name);
const dom=new JSDOM('<div id="root"></div>',{url:"http://localhost/dashboard/settings"});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
globalThis.fetch=async()=>{throw new Error("Unexpected network request")};
const {createRoot}=await import("react-dom/client");
const routes:string[]=[];
const router={replace:(url:string)=>routes.push(url),push:(url:string)=>routes.push(url)};
const notices:string[]=[];
const sessions:Array<ReturnType<typeof deferred<sessionState.SessionResponse>>>=[];
const passwords:Array<ReturnType<typeof deferred<unknown>>>=[];
const api={fetchJson:(path:string)=>{
    if(path==="/auth/session"){const request=deferred<sessionState.SessionResponse>();sessions.push(request);return request.promise}
    if(path==="/user/settings/password"){const request=deferred<unknown>();passwords.push(request);return request.promise}
    if(path==="/user/settings/preferences")return Promise.resolve({});
    throw new Error(`Unexpected API call ${path}`);
}};
type AuthView={user:sessionState.User|null;isLoggedIn:boolean;isLoading:boolean;isAuthenticated:boolean;reauthenticationRequired:boolean;refreshSession:()=>Promise<void>};
const auth=load<{AuthProvider:React.ComponentType<React.PropsWithChildren>;useAuth:()=>AuthView}>("context/AuthContext.tsx",{"@/lib/api":api,"./authSessionState":sessionState});
const empty=()=>null;
const common={"next/navigation":{useRouter:()=>router,usePathname:()=>"/dashboard/settings",useSearchParams:()=>new URLSearchParams("passwordChanged=1")},"lucide-react":new Proxy({},{get:()=>empty}),"@/context/AuthContext":auth,"@/lib/api":api,"@/lib/notify":{notify:(message:string)=>notices.push(message)},"@/lib/settingsPasswordError":{getPasswordUpdateErrorMessage},"@/lib/safeRedirect":{safeRedirectPath}};
const field=load<{default:React.ComponentType}>("components/ui/PasswordField.tsx",common);
const interop=(value:object)=>({...value,__esModule:true});
const Settings=load<{default:React.ComponentType}>("app/(site)/dashboard/settings/page.tsx",{...common,"@/components/ui/PasswordField":interop(field)}).default;
const Guard=load<{default:React.ComponentType<React.PropsWithChildren>}>("components/dashboard/DashboardAuthGuard.tsx",common).default;
let view!:AuthView;
function Probe(){view=auth.useAuth();return null}
const root=createRoot(document.getElementById("root")!);
await act(async()=>root.render(React.createElement(auth.AuthProvider,null,React.createElement(Probe),React.createElement(Guard,null,React.createElement(Settings)))));
const signedIn:sessionState.SessionResponse={type:"user",authenticated:true,user:{id:"synthetic-account",email:"synthetic@example.invalid",role:"user",email_verified:true},billing_policy:{mode:"free",purchases_enabled:false,processing_unit_limits_enforced:false}};
await act(async()=>sessions[0].resolve(signedIn));assert.equal(view.isLoggedIn,true);
async function fill(){
    const inputs=document.querySelectorAll('input[type="password"]');assert.equal(inputs.length,3);
    await act(async()=>{["old-password-123","new-password-456","new-password-456"].forEach((value,i)=>{
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(inputs[i],value);
        inputs[i].dispatchEvent(new dom.window.Event("input",{bubbles:true}));
    })});
}
async function submit(){await act(async()=>document.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true})))}
await fill();await submit();assert.equal(passwords.length,1);
await act(async()=>passwords[0].reject(new Error("Incorrect current password")));
assert.equal(view.isLoggedIn,true);assert.match(document.querySelector('[role="alert"]')!.textContent!,/Current password is incorrect/);
assert.equal(routes.length,0);
// Start a refresh before successful password change, then deliver its stale
// authenticated response afterward. It must not resurrect the dashboard.
let refresh!:Promise<void>;
await act(async()=>{refresh=view.refreshSession()});assert.equal(sessions.length,2);
// Refresh temporarily hides the form; deliver a current user response first,
// then keep a second in-flight response behind the password submission.
await act(async()=>{sessions[1].resolve(signedIn);await refresh});
await fill();await submit();assert.equal(passwords.length,2);
await act(async()=>{refresh=view.refreshSession()});
await act(async()=>passwords[1].resolve({status:"success",reauthentication_required:true}));
assert.equal(view.isLoggedIn,false);assert.equal(view.user,null);assert.equal(view.isAuthenticated,false);assert.equal(view.reauthenticationRequired,true);
assert.equal((window as Window & {__PLATEN_SESSION__?:unknown}).__PLATEN_SESSION__,undefined);
assert.ok(routes.length>0);assert.ok(routes.every(url=>url==="/login?passwordChanged=1"));
await act(async()=>{sessions[2].resolve(signedIn);await refresh});assert.equal(view.isLoggedIn,false);assert.equal(view.user,null);
assert.equal(document.querySelector("form"),null,"stale refresh cannot restore settings form");
assert.ok(notices.some(message=>message.includes("All sessions were signed out")));
const Login=load<{default:React.ComponentType}>("app/(site)/login/page.tsx",{...common,"next/link":interop({default:({children}:React.PropsWithChildren)=>children}),"@/components/ui/PasswordField":interop(field),"@/components/auth/GoogleLoginButton":interop({default:empty}),"@/components/auth/PolicyConsentDialog":interop({default:empty})}).default;
await act(async()=>root.render(React.createElement(auth.AuthProvider,null,React.createElement(Probe),React.createElement(Login))));
assert.match(document.body.textContent!,/Password updated\. All sessions were signed out\. Sign in with your new password/);
// A deliberate fresh login/session refresh is still allowed after revocation.
await act(async()=>{refresh=view.refreshSession()});
await act(async()=>{sessions.at(-1)!.resolve(signedIn);await refresh});assert.equal(view.isLoggedIn,true);assert.equal(view.reauthenticationRequired,false);
await act(async()=>root.unmount());dom.window.close();
console.log("PASS: actual settings/AuthProvider/guard/login chain signs out, fences stale session responses, preserves wrong-password feedback and allows fresh sign-in");
