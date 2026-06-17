#!/bin/bash

# Simple script to deploy the standalone static site to GitHub Pages
# Use this after committing your changes to the main branch.

set -e

echo "Deploying 'site' to gh-pages branch..."

# Check if origin exists
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "Error: 'origin' remote not found. Please run: git remote add origin <your-repo-url>"
    exit 1
fi

# Push the subtree
git subtree push --prefix site origin gh-pages

echo "Success. Your site should be live at your GitHub Pages URL shortly."
