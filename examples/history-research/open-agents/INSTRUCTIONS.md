# History Research System

An open agent system for researching historical topics and producing multiple output formats.

---

## How This System Works

1. **Entry points** (CLAUDE.md/AGENTS.md/GEMINI.md) point here
2. **This file** is the index - it describes available agents
3. **Agent files** load on demand when triggered

---

## Available Agents

### 1. The Researcher (`agents/researcher.md`)

**Purpose:** Research historical topics and produce rich markdown articles.

**When to use:**
- User asks to "research" a topic
- User asks to "expand" an existing article
- User provides a stub file

**Output:** Markdown files in `open-agents/output-articles/`

### 2. The HTML Generator (`agents/html_generator.md`)

**Purpose:** Transform markdown articles into themed HTML pages.

**When to use:**
- User asks to "create HTML"
- User asks to "make a webpage"

**Output:** HTML files in `open-agents/output-html/`

### 3. The Data Extractor (`agents/data_extractor.md`)

**Purpose:** Extract structured JSON from articles.

**When to use:**
- User asks to "extract data"
- User asks to "create JSON"

**Output:** JSON files in `open-agents/output-data/`

---

## Routing Logic

| User says... | Agent |
|--------------|-------|
| "Research the history of X" | Researcher |
| "Expand this article" | Researcher |
| "Create HTML from this" | HTML Generator |
| "Extract data into JSON" | Data Extractor |
| "Create all outputs" | Researcher → HTML → Extractor |

---

## Commands

| Command | Description |
|---------|-------------|
| `/history research [topic]` | Research and create article |
| `/history html [file]` | Generate HTML from article |
| `/history extract [file]` | Extract structured JSON |

---

## Workflow

### Standard Research Flow

```
source/stub.md → Researcher → output-articles/article.md
```

### Full Pipeline

```
source/stub.md → Researcher → HTML Generator → Data Extractor
                     ↓              ↓              ↓
              output-articles/  output-html/  output-data/
```

---

## Source Files

Place stub files in `source/` to initiate research:

```markdown
# The History of [Topic]

> Brief description to guide research.

## Key Questions
- Question 1?
- Question 2?

## Time Period
[Specify if relevant]

<!-- Stub file. Ask the Researcher to expand this. -->
```

---

## Output Standards

### Articles (Markdown)
- Comprehensive coverage
- Properly cited sources
- Organized with clear sections
- Include timeline if relevant

### HTML Pages
- Styled with period-appropriate theme
- Responsive layout
- Print-friendly
- Accessible

### JSON Data
- Structured schema
- Timeline events
- Key figures
- Important dates

---

## File Naming

| Type | Convention | Example |
|------|------------|---------|
| Stub | `topic.md` | `disney_animation.md` |
| Article | `topic-article.md` | `disney_animation-article.md` |
| HTML | `topic.html` | `disney_animation.html` |
| JSON | `topic.json` | `disney_animation.json` |
