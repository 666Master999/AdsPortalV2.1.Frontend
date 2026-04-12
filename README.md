# Vue 3 + Vite

This template should help get you started developing with Vue 3 in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about IDE Support for Vue in the [Vue Docs Scaling up Guide](https://vuejs.org/guide/scaling-up/tooling.html#ide-support).

## API base URL

The frontend reads the backend base URL from `VITE_API_BASE_URL`.

- `npm run dev` uses `http://localhost:5122`
- `npm run build` uses `http://adportal.runasp.net`

If the frontend is served over HTTPS and the backend only exposes HTTP, the browser will block those requests. In that case, expose the backend over HTTPS or proxy it through the same origin.

## Access Policy

See [ACCESS_GUIDE.md](ACCESS_GUIDE.md) for the access-control rules used by this frontend.
