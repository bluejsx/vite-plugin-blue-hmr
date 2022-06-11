export const hmrload = (self) => {
  self.__canUpdate = true;
  //---------------
  self.__mod_props = new Map();
  self.__func_call = new Map();

  //---------------
  const p_handler = {
    get(target, prop) {
      if (typeof target[prop] === "function") {
        return (...args) => {
          target.__func_call.set(prop, args);
          return target[prop](...args);
        };
      } else if (!Object.getOwnPropertyDescriptor(target, prop).get) {
        // if prop is not a function & not a getter
        target.__canUpdate = false;
      }
      return Reflect.get(...arguments);
    },
    set(target, prop, value) {
      target.__mod_props.set(prop, value);
      target[prop] = value;
      return true;
    },
  };
  self.__newestElem = new Proxy(self, p_handler);
  return p_handler;
};
