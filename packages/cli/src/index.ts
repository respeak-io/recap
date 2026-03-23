#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import { processVideo } from "./ai/pipeline.js";
import { writeMarkdown } from "./output/markdown.js";
import { writeMdx } from "./output/mdx.js";
import { analyzeCodebase } from "./analyze/index.js";
import { recordFeatures } from "./record/index.js";
import { produceOutput } from "./produce/index.js";
import { createInterface } from "node:readline/promises";

const program = new Command();

program
  .name("reeldocs")
  .description("Generate documentation from product videos")
  .version("0.2.0");

// --- Original video-to-docs command (default) ---

program
  .argument("[source]", "Video file path or URL")
  .option("--output <dir>", "Output directory", "./docs")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY env var)")
  .option("-f, --format <format>", "Output format: markdown, mdx", "markdown")
  .option("-m, --model <model>", "Gemini model to use", "gemini-2.5-flash")
  .action(async (source: string | undefined, opts: { output: string; apiKey?: string; format: string; model: string }) => {
    if (!source) {
      program.help();
      return;
    }

    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting...").start();

    try {
      const doc = await processVideo(source, apiKey, {
        model: opts.model,
        onProgress: (_step, message) => {
          spinner.text = message;
        },
      });

      spinner.text = "Writing files...";
      let files: string[];
      if (opts.format === "mdx") {
        files = await writeMdx(doc, opts.output);
      } else {
        files = await writeMarkdown(doc, opts.output);
      }

      spinner.succeed(`Generated ${files.length} doc(s) in ${opts.output}/`);
      console.log();
      for (const f of files) {
        console.log(`  ${f}`);
      }
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed");
      process.exit(1);
    }
  });

// --- analyze command ---

program
  .command("analyze")
  .description("Analyze a codebase and generate a documentation plan file")
  .requiredOption("--codebase <dir>", "Path to the codebase to analyze")
  .requiredOption("--app <url>", "URL of the running app")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .option("-o, --output <path>", "Plan file output path", "./plan.yaml")
  .option("--hints <text>", "Focus hints for feature discovery")
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Analyzing codebase...").start();

    try {
      const plan = await analyzeCodebase({
        codebaseDir: opts.codebase,
        appUrl: opts.app,
        apiKey,
        model: opts.model,
        hints: opts.hints,
        outputPath: opts.output,
        onProgress: (msg) => { spinner.text = msg; },
      });

      const featureCount = plan.features.length;
      const categories = new Set(plan.features.map((f) => f.category));
      spinner.succeed(`Found ${featureCount} features across ${categories.size} categories`);
      console.log(`\nPlan written to ${opts.output}`);
      console.log("Review the plan, fill in auth credentials, then run:");
      console.log(`  reeldocs record --plan ${opts.output}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Analysis failed");
      process.exit(1);
    }
  });

// --- record command ---

program
  .command("record")
  .description("Record browser walkthroughs from a plan file")
  .requiredOption("--plan <path>", "Path to the plan YAML file")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .option("--concurrency <n>", "Max concurrent recordings", parseInt)
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting recording...").start();

    try {
      const manifest = await recordFeatures({
        planPath: opts.plan,
        apiKey,
        model: opts.model,
        concurrency: opts.concurrency,
        onProgress: (msg) => { spinner.text = msg; },
      });

      const succeeded = Object.values(manifest.features).filter((f) => f.status === "success").length;
      const failed = Object.values(manifest.features).filter((f) => f.status === "failed").length;

      spinner.succeed(`Recording complete: ${succeeded} succeeded, ${failed} failed`);
      if (failed > 0) {
        console.log("\nFailed features:");
        for (const [id, f] of Object.entries(manifest.features)) {
          if (f.status === "failed") console.log(`  ✗ ${id}: ${f.error}`);
        }
      }
      console.log("\nNext step:");
      console.log(`  reeldocs produce --plan ${opts.plan}`);
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Recording failed");
      process.exit(1);
    }
  });

// --- produce command ---

program
  .command("produce")
  .description("Generate narrated videos and text docs from recordings")
  .requiredOption("--plan <path>", "Path to the plan YAML file")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting production...").start();

    try {
      await produceOutput({
        planPath: opts.plan,
        apiKey,
        model: opts.model,
        onProgress: (msg) => { spinner.text = msg; },
      });

      spinner.succeed("Production complete!");
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Production failed");
      process.exit(1);
    }
  });

// --- generate command (convenience wrapper) ---

program
  .command("generate")
  .description("Analyze, record, and produce in one step")
  .requiredOption("--codebase <dir>", "Path to the codebase to analyze")
  .requiredOption("--app <url>", "URL of the running app")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY)")
  .option("-m, --model <model>", "Gemini model", "gemini-2.5-flash")
  .option("-o, --output <path>", "Plan file path", "./plan.yaml")
  .option("--hints <text>", "Focus hints for feature discovery")
  .option("--concurrency <n>", "Max concurrent recordings", parseInt)
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (opts) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Analyzing codebase...").start();

    try {
      // Step 1: Analyze
      const plan = await analyzeCodebase({
        codebaseDir: opts.codebase,
        appUrl: opts.app,
        apiKey,
        model: opts.model,
        hints: opts.hints,
        outputPath: opts.output,
        onProgress: (msg) => { spinner.text = msg; },
      });

      spinner.stop();
      console.log(`\nFound ${plan.features.length} features:`);
      for (const f of plan.features) {
        console.log(`  • ${f.title} (${f.category}) — ${f.steps.length} steps`);
      }
      console.log(`\nPlan saved to ${opts.output}`);

      // Step 2: Confirm (unless --yes)
      if (!opts.yes) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await rl.question("\nProceed with recording? (y/N) ");
        rl.close();
        if (answer.toLowerCase() !== "y") {
          console.log("Aborted. Edit the plan file and run: reeldocs record --plan " + opts.output);
          return;
        }
      }

      // Step 3: Record
      spinner.start("Recording...");
      await recordFeatures({
        planPath: opts.output,
        apiKey,
        model: opts.model,
        concurrency: opts.concurrency,
        onProgress: (msg) => { spinner.text = msg; },
      });

      // Step 4: Produce
      spinner.text = "Producing...";
      await produceOutput({
        planPath: opts.output,
        apiKey,
        model: opts.model,
        onProgress: (msg) => { spinner.text = msg; },
      });

      spinner.succeed("Done! Check the generated videos and docs.");
    } catch (err) {
      spinner.fail(err instanceof Error ? err.message : "Failed");
      process.exit(1);
    }
  });

program.parse();
