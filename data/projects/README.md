# Curated Projects

This folder contains user-curated research projects. Each project is a folder with curated site data that you've researched and verified.

## The Example Project

The `example/` folder contains the Greater Manchester historical GIS project - a real research project you can use as a template and reference.

## Starting Your Own Project

1. Copy the `example/` folder:
   ```bash
   cp -r example/ my-region/
   ```

2. Edit `my-region/sites.json`:
   - Update metadata (project name, author, region)
   - Define your layers
   - Add your curated features

3. The map will load your project and show it by default (reference data hidden)

## Project Structure

```
my-research/
└── sites.json       # Your curated sites with layers
```

## Why This Exists

- **Your research stays yours** - projects are gitignored so you don't accidentally share unfinished work
- **Platform for everyone** - others can fork this repo and create projects for their own regions
- **Reference data is separate** - third-party data (Historic England, OSM, etc.) is always available for research but doesn't clutter your curated view

## Sharing Your Project

When ready to share, you can:
1. Create a separate repo for your project data
2. Or remove your project folder from `.gitignore` and commit it
