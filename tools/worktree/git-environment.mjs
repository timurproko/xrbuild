// Bind Git operations to their explicit cwd, never a caller's selected repository/index/object store.
export const contextEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/i.test(key)
  && !/^(?:GH_REPO|GH_HOST)$/.test(key)));
