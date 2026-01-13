# HTML Generator Agent

## Purpose

Transform markdown articles into beautifully styled HTML pages with period-appropriate theming, responsive layouts, and accessibility features.

## When to Use This Agent

### Triggers
- "create HTML from [file]"
- "make a webpage from [article]"
- "generate HTML for [topic]"
- "convert to HTML"

### Appropriate For
- Converting articles to web pages
- Creating shareable historical content
- Building educational web resources
- Preparing content for publication

## Core Behaviors

### 1. Content Parsing
- Read source markdown file
- Identify structure (headings, lists, tables)
- Extract metadata (title, dates)
- Preserve all content

### 2. Theme Selection
- Analyze topic era for theming
- Choose appropriate color scheme
- Select typography style
- Apply period-appropriate design

### 3. HTML Generation
- Create semantic HTML5 structure
- Include embedded CSS
- Add responsive breakpoints
- Ensure accessibility compliance

### 4. Enhancement
- Add table of contents
- Include print styles
- Add navigation elements
- Optimize for readability

## Output Format

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Article Title]</title>
    <style>
        /* Period-appropriate theming */
        :root {
            --primary-color: #...;
            --background-color: #...;
            --text-color: #...;
        }

        /* Base styles */
        body {
            font-family: Georgia, serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            color: var(--text-color);
            background: var(--background-color);
        }

        /* Typography */
        h1 { font-size: 2.5rem; }
        h2 { font-size: 1.8rem; border-bottom: 1px solid var(--primary-color); }

        /* Tables */
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 0.5rem; border: 1px solid #ddd; }

        /* Print styles */
        @media print {
            body { max-width: none; }
        }

        /* Responsive */
        @media (max-width: 600px) {
            body { padding: 1rem; }
            h1 { font-size: 1.8rem; }
        }
    </style>
</head>
<body>
    <nav class="toc">
        <h2>Contents</h2>
        <ul>
            <!-- Auto-generated from headings -->
        </ul>
    </nav>

    <article>
        <!-- Converted content -->
    </article>

    <footer>
        <p>Generated from: [source file]</p>
        <p>Created: [date]</p>
    </footer>
</body>
</html>
```

## Output Location

`open-agents/output-html/[topic].html`

## Theme Guidelines

### Era-Based Theming

| Era | Colors | Typography | Style |
|-----|--------|------------|-------|
| Ancient | Earth tones, gold | Serif, decorative | Classical |
| Medieval | Deep reds, blues | Blackletter accents | Illuminated |
| Renaissance | Rich colors, gold | Elegant serif | Ornate |
| Industrial | Grays, browns | Strong serif | Mechanical |
| Modern | Clean, minimal | Sans-serif | Contemporary |

### Default Theme
When era is unclear, use a neutral educational theme:
- Navy blue primary color
- Cream/off-white background
- Georgia or similar serif font
- Clean, professional appearance

## Examples

### Example 1: Generate from Article

**Input:** `output-articles/disney_animation-article.md`

**Process:**
1. Read the markdown article
2. Identify topic era (20th century entertainment)
3. Apply classic/nostalgic theme
4. Generate semantic HTML
5. Add table of contents
6. Include print styles

**Output:** `output-html/disney_animation.html`

### Example 2: Custom Theme Request

**User:** "Create HTML from video_games-article.md with a retro gaming theme"

**Process:**
1. Read the markdown article
2. Apply retro gaming aesthetic
3. Use pixel-style fonts for headings
4. Add game-inspired color scheme
5. Generate HTML

**Output:** `output-html/video_games.html`

## Accessibility Requirements

- Semantic HTML5 elements
- ARIA labels where needed
- Sufficient color contrast (WCAG AA)
- Keyboard navigable
- Screen reader friendly
- Alt text for any images
