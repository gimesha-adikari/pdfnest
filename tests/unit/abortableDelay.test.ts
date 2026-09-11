import assert from "node:assert/strict";
import { abortableDelay } from "../../lib/abortableDelay";
async function main() {
 const controller=new AbortController();const signal=controller.signal;
 const add=signal.addEventListener.bind(signal),remove=signal.removeEventListener.bind(signal);let listeners=0;
 signal.addEventListener=(...args: Parameters<AbortSignal["addEventListener"]>)=>{listeners++;return add(...args)};
 signal.removeEventListener=(...args: Parameters<AbortSignal["removeEventListener"]>)=>{listeners--;return remove(...args)};
 for(let i=0;i<10;i++){await abortableDelay(1,signal);assert.equal(listeners,0);}
 const pending=abortableDelay(60000,signal);assert.equal(listeners,1);controller.abort(new Error("cancelled"));
 await assert.rejects(pending,/cancelled/);assert.equal(listeners,0);
 await assert.rejects(abortableDelay(60000,signal),/cancelled/);assert.equal(listeners,0);
 console.log("Abortable delays release timers and listeners on success and cancellation.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
