import { runHybridExecutionTests } from "./unit/hybridExecution.test";
import { runWave1ExecutionTests } from "./unit/wave1Execution.test";
import { runMergeExecutionTests } from "./unit/mergeExecution.test";
import { runWatermarkExecutionTests } from "./unit/watermarkExecution.test";
import { runPageNumbersExecutionTests } from "./unit/pageNumbersExecution.test";
import { runAddTextExecutionTests } from "./unit/addTextExecution.test";
import { runImagesToPdfExecutionTests } from "./unit/imagesToPdfExecution.test";
import { runCropExecutionTests } from "./unit/cropExecution.test";
import { setupNodeWasmWorker } from "./setupNodeWasmWorker";

async function main() {
    setupNodeWasmWorker();
    console.log("=== STARTING FULL HYBRID SUITE ===\n");
    const resRotate = await runHybridExecutionTests();
    const resWave1 = await runWave1ExecutionTests();
    const resMerge = await runMergeExecutionTests();
    const resWatermark = await runWatermarkExecutionTests();
    const resPageNumbers = await runPageNumbersExecutionTests();
    const resAddText = await runAddTextExecutionTests();
    await runImagesToPdfExecutionTests();
    await runCropExecutionTests();

    const totalFailed =
        resRotate.failed +
        resWave1.failed +
        resMerge.failed +
        resWatermark.failed +
        resPageNumbers.failed +
        resAddText.failed;
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

