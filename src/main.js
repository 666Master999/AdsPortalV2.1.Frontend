import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

function installFetchTracer() {
	if (!import.meta.env.DEV) return
	if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
	if (window.__FETCH_TRACER_INSTALLED__) return

	window.__FETCH_TRACER_INSTALLED__ = true

	const originalFetch = window.fetch.bind(window)
	let reqId = 0
	let total = 0
	const active = new Map()
	const stats = {}

	function getUrl(input) {
		if (typeof input === 'string') return input
		if (input instanceof Request) return input.url
		if (input && typeof input === 'object' && typeof input.url === 'string') return input.url
		return String(input || '')
	}

	function normalizeUrl(url) {
		try {
			return new URL(url, window.location.href).pathname + new URL(url, window.location.href).search
		} catch {
			return String(url || '')
		}
	}

	function formatBody(body) {
		if (body == null) return ''
		if (typeof body === 'string') return body
		if (body instanceof URLSearchParams) return body.toString()
		if (body instanceof FormData) return '[FormData]'
		if (body instanceof Blob) return `[Blob:${body.type || 'unknown'}:${body.size || 0}]`
		if (body instanceof ArrayBuffer) return `[ArrayBuffer:${body.byteLength}]`
		if (ArrayBuffer.isView(body)) return `[TypedArray:${body.byteLength}]`
		if (typeof body === 'object') {
			try {
				return JSON.stringify(body)
			} catch {
				return '[Object]'
			}
		}
		return String(body)
	}

	window.fetch = async (...args) => {
		const id = ++reqId
		const [input, options] = args
		const url = getUrl(input)
		const method = options?.method || (input instanceof Request && input.method) || 'GET'
		const start = performance.now()
		const stack = new Error().stack
		const normalized = normalizeUrl(url)

		total += 1
		stats[normalized] = (stats[normalized] || 0) + 1

		console.log('TOTAL REQUESTS:', total)
		console.log('STATS:', stats)
		console.log(`%c[REQ ${id}] → ${url}`, 'color: orange', options || input)

		active.set(id, {
			url,
			method,
			start,
			stack,
			body: formatBody(options?.body),
		})

		try {
			const res = await originalFetch(...args)

			const meta = active.get(id)
			if (meta) {
				const time = (performance.now() - meta.start).toFixed(0)
				console.log(`%c[RES ${id}] ✔ ${meta.url} (${time}ms)`, 'color: green')
				active.delete(id)
			}

			return res
		} catch (err) {
			const meta = active.get(id)
			if (meta) {
				const time = (performance.now() - meta.start).toFixed(0)
				console.log(`%c[ERR ${id}] ✖ ${meta.url} (${time}ms)`, 'color: red')
				console.log('STACK TRACE:\n', meta.stack)
				active.delete(id)
			}

			throw err
		}
	}

	window.__FETCH_TRACER__ = { active, stats, get total() { return total } }
}

const app = createApp(App)
app.use(createPinia())
app.use(router)
installFetchTracer()

// Clean IntersectionObserver-based lazy loader for <img>
 
let observer = null
const observedEls = new WeakSet()

const BROKEN_BG_SVG = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http%3A//www.w3.org/2000/svg%22%20width=%2248%22%20height=%2248%22%3E%3Crect%20width=%2248%22%20height=%2248%22%20fill=%22%23f3f4f6%22/%3E%3Cpath%20d=%22M12%2028l9-12%205%206%2010-12%2012%2016H12z%22%20fill=%22%23e5e7eb%22/%3E%3C/svg%3E'

const createObserver = () => {
 	if (!(typeof window !== 'undefined' && 'IntersectionObserver' in window)) return null

 	const getRootMargin = () => {
 		const w = window.innerWidth || 1024
 		if (w >= 1200) return '400px 0px'
 		if (w >= 768) return '250px 0px'
 		return '120px 0px'
 	}

 	const local = new IntersectionObserver((entries) => {
 		entries.forEach(entry => {
 			if (!entry.isIntersecting) return
 			const el = entry.target
 			const src = el.dataset.lazySrc || el.getAttribute('data-lazy-src')
 			if (!src) {
 				local.unobserve(el)
 				observedEls.delete(el)
 				return
 			}

			el.onload = () => {
				el.classList.remove('bg-light', 'placeholder', 'opacity-0')
				el.classList.add('opacity-100')
				el.onload = null
			}
			el.onerror = () => {
				el.classList.remove('placeholder', 'opacity-0')
				el.classList.add('bg-light', 'border', 'opacity-100')
				el.src = PLACEHOLDER
				el.onerror = null
			}
 			// ensure decoding hint
 			if (!el.getAttribute('decoding')) el.setAttribute('decoding', 'async')
 			el.src = src
 			el.removeAttribute('data-lazy-src')
 			local.unobserve(el)
 			observedEls.delete(el)
 		})
 	}, { rootMargin: getRootMargin(), threshold: 0.01 })

 	return local
}

// initialise
observer = createObserver()

// Recreate observer on resize (debounced) so rootMargin adapts to viewport
if (typeof window !== 'undefined') {
 	let resizeTimer = null
 	window.addEventListener('resize', () => {
 		clearTimeout(resizeTimer)
 		resizeTimer = setTimeout(() => {
 			if (!(typeof window !== 'undefined' && 'IntersectionObserver' in window)) return
 			// find pending elements in DOM instead of iterating WeakSet
 			const pending = Array.from(document.querySelectorAll('img[data-lazy-src]'))
 			if (observer) observer.disconnect()
 			observer = createObserver()
 			if (observer) pending.forEach(el => { if (document.contains(el)) observer.observe(el) })
 		}, 180)
 	})
}

const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22%3E%3C/svg%3E'

const scheduleLazy = (el, src) => {
 	if (!src) return
 	if (el.dataset.lazySrc === src || el.src === src) return

 	// mark as placeholder state via CSS class
 	el.setAttribute('data-lazy-src', src)
 	el.src = PLACEHOLDER
 	el.classList.remove('opacity-100', 'border')
 	el.classList.add('bg-light', 'rounded', 'opacity-0')

 	// set decoding hint if not present
 	if (!el.getAttribute('decoding')) el.setAttribute('decoding', 'async')

 	if (observer && !observedEls.has(el)) {
 		observer.observe(el)
 		observedEls.add(el)
 	} else if (!observer) {
 		el.src = src
 		el.classList.remove('lazy--placeholder')
 		el.classList.add('lazy--loaded')
 	}
}

app.directive('intersect-lazy', {
 	mounted(el, binding) {
 		scheduleLazy(el, binding.value)
 	},

 	updated(el, binding) {
 		scheduleLazy(el, binding.value)
 	},

 	beforeUnmount(el) {
 		if (observer) {
 			observer.unobserve(el)
 			observedEls.delete(el)
 		}
 	}
})

app.mount('#app')
