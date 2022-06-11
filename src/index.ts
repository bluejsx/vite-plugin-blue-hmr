import { Transformer, Scope, CodePlace } from 'https://cdn.skypack.dev/@bluejsx/code-transformer@^0.0.12?dts';
export { hmrload } from './hmrload.js';
export const transform = (code: string) => {

  const t0 = new Transformer(code)
  // arrow functions into normal functions
  t0.addTransform({
    regex: /export +(?:default|const (?<name>[A-Z]\w*) *=) *\((?<param>[\w, {}\[\]]*)\) *=>[ \n]*(?:{|(?<bstart>(?:\([ \n]*)?Blue.r\())/g,
    replaceWGroup({ name, param, bstart }) {
      let replacement = ''
      if (name) {
        replacement = `export function ${name}(${param}){`
      } else {
        replacement = `export default function(${param}){`
      }
      if (bstart) {
        replacement += ' const self =' + bstart
      }
      return replacement
    },
    addWGroup({ bstart }) {
      const adding = []
      if (bstart) {
        adding.push({
          adding: '; return self }',
          scope: Scope.SAME,
          place: CodePlace.AFTER
        })
      }
      return adding
    }
  })

  code = t0.transform();


  const SELF_UPDATER = (self_name: string, expt_name: string) =>
    `//-----------------------------
if(import.meta.hot){
  const p_handler = hmrload(${self_name});
  import.meta.hot.accept((mod)=>{
    if(!${self_name}.__canUpdate) import.meta.hot.decline()
    const newElem = Blue.r(mod.${expt_name}, _bjsx_comp_attr, _bjsx_comp_attr.children)
    try{
      //---------------
      newElem.__mod_props = ${self_name}.__mod_props;
      for(const [key, value] of newElem.__mod_props.entries()){
        newElem[key] = value
      }

      newElem.__func_call = ${self_name}.__func_call
      for(const [key, value] of newElem.__func_call.entries()){
        newElem[key](...value)
      }

      //---------------
    } catch(_){
      import.meta.hot.decline()
    }
    ${self_name}.__newestElem = new Proxy(newElem, p_handler)
    ${self_name}.before(newElem)
    ${self_name}.remove()
  })
}
`
  const t1 = new Transformer(code)
  // move the function parameter
  t1.addTransform({
    regex: /(?<rest>export(?: +default)? +function(?: +[A-Z]\w*)? *)\( *(?<param>{[\w, ]*}) *\) *\{/g,
    replaceWGroup({ rest }) {
      return `${rest}(_bjsx_comp_attr){`
    },
    addWGroup({ param }) {
      return [{
        adding: `let ${param} = _bjsx_comp_attr;`,
        scope: Scope.CHILD,
        place: CodePlace.START
      }]
    }
  })

  let added_import = false

  t1.addTransform({
    regex: /export(?: +default)? +function(?: +(?<name>[A-Z]\w*))? *\([\w{},: ]*\) *\{/g,
    add() {
      if (!added_import) {
        added_import = true
        return [{
          adding: 'import { hmrload } from "@bluejsx/vite-plugin-blue-hmr";',
          scope: Scope.FILE_ROOT,
          place: CodePlace.START
        }]
      }
    },
    nestWGroup({ name }, range) {
      /**
       * ```ts
       * elem.blahblah = 3
       * const { blah } = elem
       * blah(45)
       * ```
       * -->
       * ```ts
       * elem.__newestElem.blahblah = 3
       * const { blah } = elem
       * elem.__newestElem.blah(45)
       * ```
       */
      const modElem = (elem: string) => {
        t1.addTransform({
          regex: new RegExp(`[^\\w]${elem}\\s*\\.`, 'g'),
          // replace: (match) => `${match[0]}__newestElem.`,
          add() {
            return [{
              adding: `__newestElem.`,
              scope: Scope.NONE,
              place: CodePlace.AFTER
            }]
          }
        }, range)

        t1.addTransform({
          regex: new RegExp(`{[\\w\\s,]+} *= *${elem}([^\\w])`, 'g'),
          replace(match) {
            const [m0, m1] = match
            return m0.substring(0, m0.length - 1) + `.__newestElem${m1}`
          }
        }, range)
      }

      return [
        {
          regex: /return (?<self>\w+)/g,
          // places self-updater right before the return statement
          addWGroup({ self }) {
            return [{
              adding: SELF_UPDATER(self, name || 'default'),
              scope: Scope.SAME,
              place: CodePlace.BEFORE
            }]
          }
        },
        {
          regex: /(?:(?:const|let) +(?<varname>\w+) *= *)?(?<rest>Blue\.r\([A-Z]\w*)/g,
          // turn elements made from other Blue component updatable
          replaceWGroup({ varname, rest }) {
            if (varname) {
              return `let ${varname} = ${rest}`
            }
          },
          WGroup({ varname }) {
            if (varname) {
              t1.addTransform({
                regex: /return (?<self>\w+)/g,
                addWGroup({ self }) {
                  if (varname === self) {
                    return [{
                      adding: `${self}.__canUpdate = false\n`,
                      scope: Scope.SAME,
                      place: CodePlace.BEFORE
                    }]
                  }
                  return []
                }
              }, range)
            }
          },
          nestWGroup({ varname }) {
            if (varname) {
              modElem(varname)
              return []
            } else {
              return [{
                regex: /ref: *\[ *[\w]+, *['"](?<refname>[\w]*)['"]\]/g,
                WGroup({ refname }) {
                  modElem(refname)
                }
              }]
            }
          }
        },
      ]
    }
  })

  return t1.transform()
}

export default function HMRLoader({ enabled } = { enabled: true }) {
  return {
    name: 'vite-plugin-blue-hmr',
    // @ts-ignore: bruh
    apply(_config, { command }) {
      return enabled && command === 'serve'
    },
    // @ts-ignore: bruh
    transform(code, id) {
      if (!id.includes('node_modules') && /\.[jt]sx$/.test(id)) {
        return transform(code)
      }
    },
  }
}
