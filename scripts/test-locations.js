const data = [
  {
    "id": 1,
    "name": "Брестская область",
    "type": "region",
    "children": [
      {
        "id": 23,
        "name": "Антополь",
        "type": "city",
        "children": []
      },
      {
        "id": 8,
        "name": "Барановичи",
        "type": "city",
        "children": []
      },
      {
        "id": 11,
        "name": "Берёза",
        "type": "city",
        "children": []
      },
      {
        "id": 7,
        "name": "Брест",
        "type": "city",
        "children": [
          {
            "id": 163,
            "name": "Ленинский",
            "type": "district",
            "children": []
          },
          {
            "id": 164,
            "name": "Московский",
            "type": "district",
            "children": []
          }
        ]
      }
    ]
  },
  {
    "id": 2,
    "name": "Витебская область",
    "type": "region",
    "children": [
      {
        "id": 48,
        "name": "Бешенковичи",
        "type": "city",
        "children": []
      },
      {
        "id": 29,
        "name": "Витебск",
        "type": "city",
        "children": [
          { "id": 165, "name": "Железнодорожный", "type": "district", "children": [] }
        ]
      }
    ]
  }
]

const LocationType = Object.freeze({ REGION: 0, CITY: 1, DISTRICT: 2 })

function toId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return null

  const id = toId(node.id)
  const name = String(node.name ?? '').trim()

  let type = null
  const rawType = node.type
  if (typeof rawType === 'string') {
    const t = rawType.toLowerCase().trim()
    if (t === 'region') type = LocationType.REGION
    else if (t === 'city') type = LocationType.CITY
    else if (t === 'district') type = LocationType.DISTRICT
  }

  const children = Array.isArray(node.children) ? node.children : []

  if (id == null || type == null || !name) return null

  return {
    id,
    name,
    type,
    children,
  }
}

function indexTree(nodes, parent = null, ancestry = [], byId = {}, parentById = {}, pathById = {}) {
  const output = []

  for (const node of nodes) {
    const normalized = normalizeNode(node)
    if (!normalized) continue

    parentById[normalized.id] = parent
    pathById[normalized.id] = [...ancestry, normalized]

    normalized.children = indexTree(
      normalized.children,
      normalized.id,
      pathById[normalized.id],
      byId,
      parentById,
      pathById,
    )

    byId[normalized.id] = normalized
    output.push(normalized)
  }

  return output
}

const nodesById = {}
const parentById = {}
const pathById = {}

const tree = indexTree(data, null, [], nodesById, parentById, pathById)

console.log('root length:', tree.length)
console.log('region ids:', tree.map(r => r.id))
console.log('region[0] children count:', tree[0].children.length)
console.log('region[0] children ids:', tree[0].children.map(c => c.id))

console.log('nodesById keys:', Object.keys(nodesById).join(','))
console.log('nodesById[7] children ids:', (nodesById[7]?.children || []).map(c => c.id))
console.log('path for district 163:', (pathById[163] || []).map(n => n.name).join(' / '))
console.log('getLocationChildren(region 1) =>', (nodesById[1]?.children || []).map(n => n.name))
console.log('getLocationChildren(city 7) =>', (nodesById[7]?.children || []).map(n => n.name))

// Simulate getLocationPath for city 7
console.log('path for city 7:', (pathById[7] || []).map(n => n.name).join(' / '))

// Simulate normalizeLocationIdList usage
function normalizeLocationIdList(value) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value]
  const seen = new Set()
  const output = []

  for (const item of items) {
    const id = Number(item)
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    output.push(id)
  }

  return output
}

console.log('normalizeLocationIdList([1,7,163]) =>', normalizeLocationIdList([1,7,163]))
console.log('\nFull node 1 object:', JSON.stringify(nodesById[1], null, 2))
