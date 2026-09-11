import assert from "node:assert/strict";
import { analyzerApi } from "../../lib/api/analyzer";
import type { TaskStatusResponse } from "../../types/analyzer";
async function main() {
 const originalTimeout=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const originalWS=globalThis.WebSocket;const originalStatus=analyzerApi.getTaskStatus;
 const timers=new Map<number,()=>unknown>();let id=0;
 globalThis.setTimeout=((callback:()=>unknown)=>{timers.set(++id,callback);return id;}) as unknown as typeof setTimeout;
 globalThis.clearTimeout=((key:number)=>{timers.delete(key);}) as unknown as typeof clearTimeout;
 globalThis.WebSocket=class {constructor(){throw new Error("unavailable");}} as unknown as typeof WebSocket;
 const tick=async()=>{const [key,callback]=timers.entries().next().value!;timers.delete(key);await callback();};
 try {
  let calls=0,updates=0;let finish!:(status:TaskStatusResponse)=>void;let signal:AbortSignal|undefined;
  analyzerApi.getTaskStatus=(_id,s)=>{calls++;signal=s;return new Promise(resolve=>{finish=resolve;});};
  const stop=analyzerApi.subscribeProgress("task",()=>{updates++;});
  const pending=tick();assert.equal(calls,1);assert.equal(timers.size,0,"no second poll while first request is pending");
  stop();assert.equal(signal?.aborted,true);finish({status:"COMPLETED"} as TaskStatusResponse);await pending;
  assert.equal(updates,0);assert.equal(timers.size,0);
  let errors=0;calls=0;
  analyzerApi.getTaskStatus=async()=>{calls++;throw new Error("offline");};
  const stopFailure=analyzerApi.subscribeProgress("task",()=>{},()=>{errors++;});
  for(let i=0;i<5;i++)await tick();
  assert.equal(calls,5);assert.equal(errors,5);assert.equal(timers.size,0,"five consecutive failures stop polling");stopFailure();
 } finally {globalThis.setTimeout=originalTimeout;globalThis.clearTimeout=originalClear;globalThis.WebSocket=originalWS;analyzerApi.getTaskStatus=originalStatus;}
 console.log("Analyzer fallback requests are sequential, cancellable, and failure bounded.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
