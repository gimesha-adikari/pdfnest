import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useStudioSession } from "../../hooks/studio-v2/useStudioSession";
import { studioV2Api } from "../../lib/studio-v2/api";

// Minimal DOM surface for a hook-only React root, matching existing hook tests.
class Element {
    nodeType = 1;
    nodeName = "DIV";
    tagName = "DIV";
    namespaceURI = "http://www.w3.org/1999/xhtml";
    style = {};
    ownerDocument: unknown;
    addEventListener() {}
    removeEventListener() {}
}
const documentMock = Object.assign(new Element(), {
    nodeType: 9,
    createElement: () => Object.assign(new Element(), { ownerDocument: documentMock }),
    defaultView: globalThis,
});
const storage = new Map<string, string>();
Object.assign(globalThis, {
    IS_REACT_ACT_ENVIRONMENT: true,
    document: documentMock,
    window: globalThis,
    HTMLIFrameElement: class {},
    localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
    },
});


Object.assign(globalThis, {location: {href: "http://localhost/studio-v2"}, history: {replaceState() {}}});
function deferred<T>() { let resolve!: (value:T)=>void; const promise = new Promise<T>(r=>{resolve=r}); return {promise,resolve}; }
function fixture<T>(value: unknown): T { return value as T; }
const data = (id:string):Awaited<ReturnType<typeof studioV2Api.getSession>> => fixture( ({session:{id},document:{id},active_version:{id:"v-"+id,parent_version_id:"parent"},vdm:{pages:[],page_count:0}}));
async function main() {
 const historyA = deferred<Awaited<ReturnType<typeof studioV2Api.getHistory>>>();
 studioV2Api.getSession=async(id)=>data(id);
 studioV2Api.getHistory=async(id)=>id==="A"?historyA.promise:fixture({versions:[{id:"history-"+id}],operations:[]});
 let hook!:ReturnType<typeof useStudioSession>;
 function Harness(){hook=useStudioSession();return null;}
 const root=createRoot(documentMock.createElement() as unknown as HTMLElement);
 try {
  await act(async()=>root.render(React.createElement(Harness)));
  let loadA!:Promise<void>;
  await act(async()=>{loadA=hook.loadSession("A");await Promise.resolve();});
  await act(async()=>{await hook.loadSession("B");});
  await act(async()=>{historyA.resolve(fixture({versions:[{id:"history-A"}],operations:[]}));await loadA;});
  assert.equal(hook.session?.id,"B");
  assert.equal(hook.history[0]?.id,"history-B","old history must not replace current session history");
  const command=deferred<Awaited<ReturnType<typeof studioV2Api.executeCommand>>>();studioV2Api.executeCommand=()=>command.promise;
  let pending!:Promise<unknown>;
  await act(async()=>{pending=hook.executeCommand(fixture({}));});
  await act(async()=>{hook.enterStudio();await hook.loadSession("C");});
  await act(async()=>{command.resolve(fixture({version:{id:"old-command-version"},vdm:{pages:[]}}));await pending;});
  assert.equal(hook.session?.id,"C");assert.equal(hook.activeVersion?.id,"v-C");
 } finally {await act(async()=>root.unmount());}
 console.log("Studio history and mutation responses remain scoped to the current session.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
