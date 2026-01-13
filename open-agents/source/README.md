# Open Agent Source Files

This directory contains input files for agent processing. Files placed here serve as the source material that agents transform, analyze, or organize.

## Overview

The `source/` folder is the input stage of the Open Agent workflow:

```
source/ (input) → agent processing → output-drafts/ → output-refined/ → output-final/
```

Place your files here when you want an agent to:
- Transform content (convert formats, rewrite, translate)
- Analyze data (summarize, extract, categorize)
- Organize information (sort, group, merge)
- Research topics (gather context, find references)

## File Types

### 1. Direct Input Files

Raw files that need processing. Just place them here with descriptive names.

```
source/
├── quarterly-report-2025-q1.pdf
├── customer-feedback-january.csv
└── product-roadmap-draft.md
```

### 2. Stub Files (`.stub.md`)

Lightweight request files that describe what you want, pointing to external sources.

```markdown
<!-- source/market-research.stub.md -->
# Market Research Request

## Source
- URL: https://example.com/industry-report
- Additional context in: ~/Documents/competitor-analysis.pdf

## Request
Summarize key trends and competitive positioning.

## Output
- Format: Markdown report
- Length: 2-3 pages
- Audience: Executive team
```

### 3. Request Files (`.request.md`)

Detailed work orders with specific instructions for complex tasks.

```markdown
<!-- source/blog-post.request.md -->
# Content Request: Blog Post

## Topic
The impact of AI on software development workflows

## Requirements
- Length: 1500-2000 words
- Tone: Professional but accessible
- Include: 3 real-world examples
- SEO keywords: AI coding, developer productivity

## Outline
1. Introduction - hook with productivity stats
2. Current state of AI tools
3. Three case studies
4. Future predictions
5. Conclusion with call to action

## References
- source/ai-productivity-study.pdf
- source/developer-survey-2025.csv
```

## Naming Conventions

| Convention | Example | Description |
|------------|---------|-------------|
| Descriptive | `customer-feedback-q1.csv` | Clear content indication |
| Date prefix | `2025-01-13-meeting-notes.md` | Time-sensitive content |
| Type suffix | `research.stub.md` | Request type indicator |
| Kebab-case | `product-roadmap-v2.md` | Consistent formatting |

### Special Suffixes

| Suffix | Purpose |
|--------|---------|
| `.stub.md` | Lightweight request pointing to sources |
| `.request.md` | Detailed work order with full instructions |
| `-draft` | Working version, not final |
| `-v1`, `-v2` | Version tracking |

## Workflow Examples

### Example 1: Document Transformation

```bash
# Place source file
cp ~/Documents/report.docx source/annual-report-2024.docx

# Describe the task
cat > source/annual-report.stub.md << 'EOF'
# Transform Request

## Source
- File: annual-report-2024.docx

## Request
Convert to Markdown, preserving formatting and tables.
Add a table of contents at the beginning.

## Output
- Format: Markdown
- Filename: annual-report-2024.md
EOF
```

### Example 2: Research Synthesis

```bash
# Create detailed request
cat > source/competitor-analysis.request.md << 'EOF'
# Research Request: Competitor Analysis

## Scope
Analyze top 5 competitors in the CRM market.

## Sources to Review
- source/gartner-magic-quadrant-2025.pdf
- source/customer-reviews-export.csv
- Web search for recent news and funding

## Deliverables
1. Feature comparison matrix
2. Pricing comparison table
3. SWOT analysis for each competitor
4. Strategic recommendations

## Format
- Markdown with tables
- Include citations
- Executive summary first
EOF
```

### Example 3: Content Creation

```bash
# Create content request with references
cat > source/newsletter.request.md << 'EOF'
# Content Request: Monthly Newsletter

## Topic
January 2025 Product Updates

## Source Material
- source/release-notes-jan-2025.md
- source/customer-success-stories.csv
- source/upcoming-features.md

## Structure
1. Featured update highlight
2. 3 smaller updates (bullet points)
3. Customer spotlight
4. Coming soon teaser

## Constraints
- Total length: 500-700 words
- Reading time: ~3 minutes
- Include 1-2 images (suggest placeholders)
EOF
```

## Integration with Agents

When an agent receives a task, it will:

1. **Scan source/** for relevant files
2. **Read stub/request files** for instructions
3. **Process source material** as directed
4. **Output to output-drafts/** for review

### Requesting Processing

You can tell an agent:

```
Process source/market-research.stub.md
```

Or reference files directly:

```
Summarize source/quarterly-report.pdf and output key findings
```

## Best Practices

### Do

- Use descriptive filenames that explain content
- Include context in stub/request files
- Specify desired output format
- Provide examples when helpful
- Clean up processed files periodically

### Don't

- Use vague names like `file1.txt` or `data.csv`
- Leave files without processing instructions
- Include sensitive credentials in request files
- Let the folder become cluttered with old files

## File Organization

For larger projects, use subdirectories:

```
source/
├── project-alpha/
│   ├── requirements.md
│   ├── user-interviews.csv
│   └── wireframes.pdf
├── blog-posts/
│   ├── 2025-01-ai-trends.request.md
│   └── 2025-02-productivity.stub.md
└── reports/
    ├── q1-sales.xlsx
    └── q1-analysis.stub.md
```

## Cleanup

Periodically clean up processed files:

```bash
# Move processed sources to archive
mkdir -p source/.archive
mv source/completed-request.md source/.archive/

# Or delete if no longer needed
rm source/old-draft.txt
```

## See Also

- [INSTRUCTIONS.md](../INSTRUCTIONS.md) - Main agent system documentation
- [output-drafts/](../output-drafts/) - Where agent outputs first appear
- [tools/](../tools/) - Custom tools for processing
