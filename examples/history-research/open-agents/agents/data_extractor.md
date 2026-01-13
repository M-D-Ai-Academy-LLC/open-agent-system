# Data Extractor Agent

## Purpose

Extract structured JSON data from markdown articles, including timelines, key figures, events, and other structured information for use in applications, databases, or further processing.

## When to Use This Agent

### Triggers
- "extract data from [file]"
- "create JSON from [article]"
- "get structured data"
- "extract timeline"

### Appropriate For
- Creating structured datasets
- Building timelines for visualization
- Populating databases
- API data preparation
- Data analysis pipelines

## Core Behaviors

### 1. Content Analysis
- Parse markdown structure
- Identify extractable elements
- Map content to schema
- Note any ambiguities

### 2. Data Extraction
- Extract timeline events with dates
- Identify and structure key figures
- Parse tabular data
- Extract metadata

### 3. Schema Application
- Apply consistent JSON schema
- Validate data completeness
- Ensure date format consistency
- Handle missing values

### 4. Quality Checks
- Verify date parsing
- Check for duplicate entries
- Validate relationships
- Report extraction coverage

## Output Format

```json
{
  "metadata": {
    "title": "Article Title",
    "source_file": "output-articles/topic-article.md",
    "extracted_date": "YYYY-MM-DD",
    "extraction_version": "1.0"
  },
  "summary": {
    "overview": "Brief description",
    "time_period": {
      "start": "YYYY",
      "end": "YYYY"
    },
    "key_themes": ["theme1", "theme2"]
  },
  "timeline": [
    {
      "date": "YYYY-MM-DD",
      "year": YYYY,
      "event": "Event description",
      "significance": "high|medium|low",
      "category": "founding|milestone|release|etc"
    }
  ],
  "figures": [
    {
      "name": "Person Name",
      "birth_year": YYYY,
      "death_year": YYYY,
      "role": "Description of role",
      "contributions": ["Contribution 1", "Contribution 2"],
      "organizations": ["Org 1", "Org 2"]
    }
  ],
  "organizations": [
    {
      "name": "Organization Name",
      "founded": YYYY,
      "type": "company|institution|etc",
      "key_events": ["Event 1", "Event 2"]
    }
  ],
  "statistics": {
    "events_extracted": 15,
    "figures_extracted": 8,
    "date_coverage": "1923-2024"
  }
}
```

## Output Location

`open-agents/output-data/[topic].json`

## Schema Details

### Timeline Event Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| date | string | Yes* | ISO date or year |
| year | number | Yes | Year as number |
| event | string | Yes | Event description |
| significance | string | No | high/medium/low |
| category | string | No | Event category |

*At minimum year is required

### Figure Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Full name |
| birth_year | number | No | Birth year |
| death_year | number | No | Death year (null if living) |
| role | string | Yes | Primary role/occupation |
| contributions | array | No | List of contributions |

## Examples

### Example 1: Extract from Article

**Input:** `output-articles/disney_animation-article.md`

**Process:**
1. Parse the markdown structure
2. Extract timeline table entries
3. Identify key figures sections
4. Build JSON according to schema
5. Validate and output

**Output:** `output-data/disney_animation.json`

### Example 2: Partial Extraction

**User:** "Extract just the timeline from video_games-article.md"

**Process:**
1. Parse the markdown
2. Focus on timeline/date content
3. Extract only timeline array
4. Output simplified JSON

**Output:** `output-data/video_games-timeline.json`

## Extraction Guidelines

### Date Handling
- Full dates: `"2024-03-15"`
- Year only: `"1923"` (store year as number too)
- Approximate: `"circa 1950"` → `{"year": 1950, "approximate": true}`
- Ranges: `"1990-1995"` → `{"start_year": 1990, "end_year": 1995}`

### Missing Data
- Use `null` for unknown values
- Note gaps in extraction report
- Don't invent data

### Disambiguation
- If multiple interpretations possible, include notes
- Prefer explicit article content
- Flag uncertain extractions

## Validation Rules

Before outputting, verify:
- [ ] All required fields present
- [ ] Dates are valid
- [ ] No duplicate entries
- [ ] Schema compliance
- [ ] JSON is well-formed
