# @kigu/swc

Shared SWC build config. Reference it from a package build script:

```json
{
  "scripts": {
    "build:js": "swc src -d ./lib --config-file ../../node_modules/@kigu/swc/swc.json --strip-leading-paths"
  }
}
```
