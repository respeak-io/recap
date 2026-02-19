#!/usr/bin/env node

import { Command } from "commander";
import ora from "ora";
import { processVideo } from "./ai/pipeline.js";
import { writeMarkdown } from "./output/markdown.js";

const program = new Command();

program
  .name("reeldocs")
  .description("Generate documentation from product videos")
  .version("0.1.0")
  .argument("<source>", "Video file path or URL")
  .option("-o, --output <dir>", "Output directory", "./docs")
  .option("-k, --api-key <key>", "Gemini API key (or set GEMINI_API_KEY env var)")
  .option("-f, --format <format>", "Output format: markdown, mdx", "markdown")
  .action(async (source: string, opts: { output: string; apiKey?: string; format: string }) => {
    const apiKey = opts.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Error: Gemini API key required. Set GEMINI_API_KEY or use --api-key");
      process.exit(1);
    }

    const spinner = ora("Starting...").start();

    try {
      const doc = await processVideo(source, apiKey, {
        onProgress: (_step, message) => {
          spinner.text = message;
        },
      });

      spinner.text = "Writing files...";
      const files = await writeMarkdown(doc, opts.output);

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

program.parse();
