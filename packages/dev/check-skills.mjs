#!/usr/bin/env node
// Validates a repo's Claude Code plugin skills. Structural rules always run; the
// style rules (--cap, --forbid-code-blocks) are per-repo policy and opt-in.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Namespaces a skill reference can name. Anything here that is not the repo's own
// plugin is a cross-repo reference, legal only when passed to --allow.
const STACK = ['kigu', 'sozai', 'kokuin', 'enkaku', 'kumiai', 'tejika', 'mokei', 'kubun']

const FENCE = /^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm

const CONFIG_FILE = 'skills-check.json'

const USAGE = `usage: kigu-check-skills [options]

  --plugin <name>          plugin under plugins/ (default: the only one there)
  --packages <dir>         workspace packages directory (default: packages)
  --cap <n>                fail any .md file longer than n lines
  --forbid-code-blocks     fail a SKILL.md containing a fenced code block
  --allow <a,b>            cross-repo skill namespaces this repo may reference

Defaults come from ./${CONFIG_FILE} if present, so a repo states its policy once
and the hook and CI both run the bare command. Keys: plugin, packages, cap,
forbidCodeBlocks, allow. Flags override the file.
`

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return {}
  let config
  try {
    config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch (cause) {
    console.error(`${CONFIG_FILE}: ${cause.message}`)
    process.exit(2)
  }
  const known = ['plugin', 'packages', 'cap', 'forbidCodeBlocks', 'allow']
  for (const key of Object.keys(config)) {
    if (!known.includes(key)) {
      console.error(`${CONFIG_FILE}: unknown key ${key}`)
      process.exit(2)
    }
  }
  return config
}

function parseArgs(argv) {
  const options = { packages: 'packages', allow: [], ...loadConfig() }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => {
      const next = argv[++i]
      if (next == null) {
        console.error(`${arg} needs a value`)
        process.exit(2)
      }
      return next
    }
    switch (arg) {
      case '--plugin':
        options.plugin = value()
        break
      case '--packages':
        options.packages = value()
        break
      case '--cap':
        options.cap = Number(value())
        if (!Number.isInteger(options.cap) || options.cap < 1) {
          console.error('--cap needs a positive integer')
          process.exit(2)
        }
        break
      case '--forbid-code-blocks':
        options.forbidCodeBlocks = true
        break
      case '--allow':
        options.allow = value()
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        break
      case '-h':
      case '--help':
        console.log(USAGE)
        process.exit(0)
        break
      default:
        console.error(`unknown option ${arg}\n\n${USAGE}`)
        process.exit(2)
    }
  }
  return options
}

const mdFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? mdFiles(join(dir, entry.name))
      : entry.name.endsWith('.md')
        ? [join(dir, entry.name)]
        : [],
  )

function resolvePlugin(options) {
  if (options.plugin != null) return options.plugin
  if (!existsSync('plugins')) {
    console.error('no plugins/ directory — run from the repo root or pass --plugin')
    process.exit(2)
  }
  const found = readdirSync('plugins', { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  if (found.length !== 1) {
    console.error(`expected one plugin under plugins/, found ${found.length} — pass --plugin`)
    process.exit(2)
  }
  return found[0]
}

const options = parseArgs(process.argv.slice(2))
const plugin = resolvePlugin(options)
const root = join('plugins', plugin, 'skills')
const failures = []

if (!existsSync(root)) {
  console.error(`missing ${root}`)
  process.exit(2)
}

// Only the repo's own scope is validated — third-party names are none of our business.
const scope = `@${plugin}/`
const realPackages = existsSync(options.packages)
  ? new Set(
      readdirSync(options.packages, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => {
          const manifest = join(options.packages, entry.name, 'package.json')
          return existsSync(manifest) ? [JSON.parse(readFileSync(manifest, 'utf8')).name] : []
        }),
    )
  : null

const skills = readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

const allowed = new Set([plugin, ...options.allow])
const foreign = STACK.filter((name) => !allowed.has(name))
// Matches `/enkaku:discover` and a bare `enkaku:discover`, but not prose like `enkaku: the RPC layer`.
const foreignRef = foreign.length ? new RegExp(`\\b(?:${foreign.join('|')}):[a-z][a-z-]*`, 'g') : null
const ownRef = new RegExp(`\\b${plugin}:([a-z][a-z-]*)`, 'g')
const scopedName = new RegExp(`${scope}[a-z0-9-]+`, 'g')

const files = mdFiles(root)

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  if (options.cap != null) {
    const lines = text.split('\n').length
    if (lines > options.cap) failures.push(`${file}: ${lines} lines, cap is ${options.cap}`)
  }
  // Skill references inside a fenced block illustrate a shape rather than pointing at
  // anything, so they are exempt. Package names are not — a sample that imports a
  // package that does not exist is still wrong.
  const prose = text.replace(FENCE, '')
  const outward = foreignRef ? prose.match(foreignRef) : null
  if (outward) failures.push(`${file}: outward reference ${[...new Set(outward)].join(', ')}`)
  if (realPackages != null) {
    for (const named of new Set(text.match(scopedName) ?? [])) {
      if (!realPackages.has(named)) failures.push(`${file}: no such package ${named}`)
    }
  }
  const ownRefs = new Map()
  for (const match of prose.matchAll(ownRef)) ownRefs.set(match[0], match[1])
  for (const [named, skill] of ownRefs) {
    if (!skills.includes(skill)) failures.push(`${file}: no such skill ${named}`)
  }
}

for (const skill of skills) {
  const file = join(root, skill, 'SKILL.md')
  if (!existsSync(file)) {
    failures.push(`${file}: missing`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!frontmatter) {
    failures.push(`${file}: no frontmatter`)
    continue
  }
  // Bare name: the plugin supplies the namespace, so `name: sozai:dataflow` would
  // resolve as /sozai:sozai:dataflow.
  const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1]?.trim()
  if (name !== skill) failures.push(`${file}: name is "${name}", expected "${skill}"`)
  if (!frontmatter[1].match(/^description:\s*\S/m)) failures.push(`${file}: no description`)
  const body = text.slice(frontmatter[0].length)
  if (options.forbidCodeBlocks && /^```/m.test(body)) {
    failures.push(`${file}: contains a code block`)
  }
  for (const [, target] of body.matchAll(/`(reference\/[a-z0-9-]+\.md)`/g)) {
    if (!existsSync(join(root, skill, target))) failures.push(`${file}: dangling pointer ${target}`)
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  console.error(`\n${failures.length} failure(s)`)
  process.exit(1)
}
console.log(`PASS ${files.length} file(s), ${skills.length} skill(s) in ${root}`)
