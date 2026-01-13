**CRITICAL: Read `open-agents/INSTRUCTIONS.md` immediately.**

# History Research Project

This project uses an Open Agent System for researching historical topics and producing multiple output formats.

## Quick Reference

| Agent | Trigger | Output |
|-------|---------|--------|
| Researcher | "research [topic]" | `open-agents/output-articles/` |
| HTML Generator | "create HTML from [file]" | `open-agents/output-html/` |
| Data Extractor | "extract data from [file]" | `open-agents/output-data/` |

## Available Commands

- `/history research [topic]` - Research and create article
- `/history html [file]` - Generate HTML from article
- `/history extract [file]` - Extract structured JSON

## Getting Started

1. Check the stub files in `open-agents/source/`
2. Run `/history research [topic]` to create an article
3. Run `/history html [file]` to create HTML version
4. Run `/history extract [file]` to get structured data
