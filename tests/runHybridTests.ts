import { runHybridExecutionTests } from "./unit/hybridExecution.test";
import { runWave1ExecutionTests } from "./unit/wave1Execution.test";

async function main() {
    console.log("=== STARTING FULL HYBRID HYBRID SUITE ===\n");
    const resRotate = await runHybridExecutionTests();
    const resWave1 = await runWave1ExecutionTests();

    const totalFailed = resRotate.failed + resWave1.failed;
    if (totalFailed > 0) {
        console.error(`\nFAILED SUITE: ${totalFailed} total tests failed.`);
        process.exit(1);
    }
    console.log("\nALL HYBRID EXECUTION TESTS COMPLETED SUCCESSFULLY!");
}

main().catch((err) => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
