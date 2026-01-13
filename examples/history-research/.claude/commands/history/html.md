# /history html

Generate a themed HTML page from a markdown article.

## Arguments

- `$ARGUMENTS` - Path to the markdown article to convert

## Instructions

1. Read the HTML Generator agent definition from `open-agents/agents/html_generator.md`
2. Follow the agent's Core Behaviors:
   - Read the source markdown file
   - Apply era-appropriate theming
   - Generate semantic HTML5 with embedded CSS
   - Include table of contents and print styles

## Usage Examples

```
/history html output-articles/disney_animation-article.md
/history html output-articles/video_games-article.md
```

## Expected Output

A styled HTML page saved to:
`open-agents/output-html/[topic].html`

The HTML should include:
- Period-appropriate visual theme
- Responsive layout
- Table of contents
- Print-friendly styles
- Accessibility features

$ARGUMENTS
