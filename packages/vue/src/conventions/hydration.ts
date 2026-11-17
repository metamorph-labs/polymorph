import { getCurrentInstance } from 'vue'

/**
 * Whether the component being set up is being hydrated. A hook asks so that a
 * hydrated component's first render is the server's: it starts from the value
 * a server render has and reads the browser's once the component has mounted.
 *
 * Vue gives a component it hydrates the server's node before its setup runs,
 * and that node is in the document. A component being mounted has no node. A
 * vnode that is kept and mounted a second time still holds the node of its
 * first mount, which Vue has removed from the document, so that component is
 * being mounted too. The node says a hydration only while it is in the
 * document.
 */
export function isHydrating(): boolean {
  // Vue types the node for any renderer. In a browser it is a DOM node, which has `isConnected`.
  const node = getCurrentInstance()?.vnode.el
  return node?.isConnected === true
}
