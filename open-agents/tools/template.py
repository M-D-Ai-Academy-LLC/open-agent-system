#!/usr/bin/env python3
"""
Tool: template
Description: Template for creating new Python tools
Author: system
Created: 2025-01-13

Usage:
    ./template.py <input_file> [--output output_file] [--format json|text]

Arguments:
    input_file      Path to input file (required)
    --output, -o    Path to output file (optional, defaults to stdout)
    --format, -f    Output format: json or text (default: json)
    --verbose, -v   Enable verbose output
    --help, -h      Show this help message

Examples:
    ./template.py data.txt
    ./template.py data.txt --output result.json
    ./template.py data.txt --format text --verbose

Exit Codes:
    0 - Success
    1 - Invalid arguments
    2 - Input file not found
    3 - Processing error
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

# =============================================================================
# Configuration
# =============================================================================

DEBUG = os.environ.get("OPEN_AGENT_DEBUG", "0") == "1"


# =============================================================================
# Helper Functions
# =============================================================================


def log_debug(message: str) -> None:
    """Print debug message if debug mode is enabled."""
    if DEBUG:
        print(f"[DEBUG] {message}", file=sys.stderr)


def log_error(message: str) -> None:
    """Print error message to stderr."""
    print(f"[ERROR] {message}", file=sys.stderr)


def log_info(message: str) -> None:
    """Print info message to stderr."""
    print(f"[INFO] {message}", file=sys.stderr)


def output_json(data: Any) -> str:
    """Format data as JSON string."""
    return json.dumps(data, indent=2, ensure_ascii=False)


def output_text(data: dict[str, Any]) -> str:
    """Format data as human-readable text."""
    lines = []
    for key, value in data.items():
        lines.append(f"{key}: {value}")
    return "\n".join(lines)


# =============================================================================
# Main Logic
# =============================================================================


def process_file(input_path: Path) -> dict[str, Any]:
    """
    Process the input file and return results.

    Replace this with your actual processing logic.

    Args:
        input_path: Path to the input file

    Returns:
        Dictionary with processing results
    """
    log_debug(f"Processing file: {input_path}")

    content = input_path.read_text(encoding="utf-8")

    # Example: analyze file content
    lines = content.splitlines()
    words = content.split()

    result = {
        "file": str(input_path),
        "lines": len(lines),
        "words": len(words),
        "characters": len(content),
        "encoding": "utf-8",
        "status": "success",
    }

    log_debug(f"Processing complete: {result}")
    return result


def main() -> int:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Template tool for the Open Agent System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    ./template.py data.txt
    ./template.py data.txt --output result.json
    ./template.py data.txt --format text --verbose
        """,
    )

    parser.add_argument(
        "input_file",
        type=Path,
        help="Path to input file",
    )

    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=None,
        help="Path to output file (default: stdout)",
    )

    parser.add_argument(
        "--format",
        "-f",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )

    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose output",
    )

    args = parser.parse_args()

    # Enable debug mode if verbose
    global DEBUG
    if args.verbose:
        DEBUG = True

    # Validate input file
    if not args.input_file.exists():
        log_error(f"Input file not found: {args.input_file}")
        return 2

    if not args.input_file.is_file():
        log_error(f"Not a file: {args.input_file}")
        return 1

    log_info(f"Processing {args.input_file}...")

    try:
        # Process the file
        result = process_file(args.input_file)

        # Format output
        if args.format == "json":
            output = output_json(result)
        else:
            output = output_text(result)

        # Write output
        if args.output:
            args.output.write_text(output, encoding="utf-8")
            log_info(f"Output written to {args.output}")
        else:
            print(output)

        return 0

    except Exception as e:
        log_error(f"Processing error: {e}")
        if DEBUG:
            import traceback
            traceback.print_exc()
        return 3


if __name__ == "__main__":
    sys.exit(main())
