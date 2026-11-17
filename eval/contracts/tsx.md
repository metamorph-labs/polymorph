## What you hand back

One screen as a TSX module, in a single fenced `tsx` block at the end of your final answer.

The module imports every member it uses from `@polymorph/react-ui` and exports one function
component. Its props are the data and callbacks the screen is handed. It holds no state and
computes nothing a container could compute instead: the container that renders it supplies the
data and the handlers.

`validate` takes the module's source in `code`. It lints the source as application code (as
`apps/app/src/Screen.tsx`) and returns every red-rule violation with the exception-ladder rungs
that answer it.
