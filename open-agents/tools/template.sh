#!/bin/bash
# =============================================================================
# Tool: template
# Description: Template for creating new shell tools
# Author: system
# Created: 2025-01-13
#
# Usage:
#   ./template.sh <input_file> [output_file]
#
# Arguments:
#   input_file   - Path to input file (required)
#   output_file  - Path to output file (optional, defaults to stdout)
#
# Examples:
#   ./template.sh data.txt
#   ./template.sh data.txt output.txt
#
# Environment:
#   OPEN_AGENT_DEBUG - Set to 1 for verbose output
#
# Exit Codes:
#   0 - Success
#   1 - Invalid arguments
#   2 - Input file not found
#   3 - Processing error
# =============================================================================

set -e  # Exit on error
set -u  # Error on undefined variables

# =============================================================================
# Configuration
# =============================================================================

DEBUG="${OPEN_AGENT_DEBUG:-0}"

# =============================================================================
# Helper Functions
# =============================================================================

log_debug() {
    if [ "$DEBUG" = "1" ]; then
        echo "[DEBUG] $*" >&2
    fi
}

log_error() {
    echo "[ERROR] $*" >&2
}

log_info() {
    echo "[INFO] $*" >&2
}

show_usage() {
    cat << 'EOF'
Usage: ./template.sh <input_file> [output_file]

Arguments:
  input_file   - Path to input file (required)
  output_file  - Path to output file (optional, defaults to stdout)

Examples:
  ./template.sh data.txt
  ./template.sh data.txt output.txt
EOF
}

# =============================================================================
# Argument Validation
# =============================================================================

if [ $# -lt 1 ]; then
    log_error "Missing required argument: input_file"
    show_usage
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="${2:-}"

if [ ! -f "$INPUT_FILE" ]; then
    log_error "Input file not found: $INPUT_FILE"
    exit 2
fi

log_debug "Input file: $INPUT_FILE"
log_debug "Output file: ${OUTPUT_FILE:-stdout}"

# =============================================================================
# Main Logic
# =============================================================================

process_file() {
    local input="$1"

    # Replace this with your actual processing logic
    # Example: count lines, words, and characters
    local lines=$(wc -l < "$input")
    local words=$(wc -w < "$input")
    local chars=$(wc -c < "$input")

    # Output as JSON for easy parsing
    cat << EOF
{
  "file": "$input",
  "lines": $lines,
  "words": $words,
  "characters": $chars,
  "status": "success"
}
EOF
}

# =============================================================================
# Execute
# =============================================================================

log_info "Processing $INPUT_FILE..."

if [ -n "$OUTPUT_FILE" ]; then
    process_file "$INPUT_FILE" > "$OUTPUT_FILE"
    log_info "Output written to $OUTPUT_FILE"
else
    process_file "$INPUT_FILE"
fi

log_debug "Processing complete"
exit 0
