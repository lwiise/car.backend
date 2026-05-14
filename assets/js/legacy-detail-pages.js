import {
  fetchPublishedDeveloperBundle,
  fetchPublishedPageBundleByRoute,
  fetchPublishedProjectBundle,
  unlockProjectBundle,
  unlockDeveloperBundle,
  getProjectCoords,
  getProjectPopupCoords,
  getDeveloperSlug,
  getProjectSlug,
} from "./cms-api.js";
import { getMyProfile } from "./auth-helpers.js";
import { getSupabase } from "./supabase-browser.js";

const DEFAULT_CENTER = [45.0792, 23.8859];
const DEFAULT_COORDS = [46.6753, 24.7136];
const DEFAULT_IMAGE_URL = "https://cdn.prod.website-files.com/6915e045b3e3d5a1e709a05d/6952c2b69244939dba62178d_1%20(2).png";
const DEFAULT_MODEL_URL = "https://raw.githubusercontent.com/lwiise/3d-models/main/the_facade_of_a_hotel_or_office.glb";
const DEFAULT_VIDEO_URL = "https://raw.githubusercontent.com/lwiise/3d-models/main/Video_Generation_Without_Logo%20(1).mp4";
const DEFAULT_VIDEO_360_URL = "https://raw.githubusercontent.com/lwiise/3d-models/main/D_Building_Video_Generation%20(1).mp4";
const GOOGLE_LIBRARIES = "marker,places,geometry";
const DEV_ZOOM = 15.4;
const DEV_PITCH = 70;
const DEV_ZOOM_CLOSE = 16.2;
const DEV_PITCH_CLOSE = 75;
const DEV_BEARING = 35;
const MAP_EMBED_ZOOM_OUT_MULTIPLIER = 1.4;
const MAP_EMBED_CAMERA_AZIMUTH = "-35deg";
const MAP_EMBED_CAMERA_ELEVATION = "72deg";
const MAP_EMBED_CAMERA_DISTANCE = 150;
const MAP_EMBED_CAMERA_DISTANCE_MIN = 115;
const MAP_EMBED_CAMERA_DISTANCE_MAX = 320;
const MAP_EMBED_FIELD_OF_VIEW = 54;

const pageType = document.body.getAttribute("data-page-type");
const developerBlock = document.getElementById("developerBlock");
const developerExploreBlock = document.getElementById("developerExploreBlock");
const developerMapsBlock = document.getElementById("developerMapsBlock");
const soloBlock = document.getElementById("soloBlock");
const mediaStage = document.getElementById("mediaStage");
const devSlideImg = document.getElementById("devSlideImg");
const devDots = document.getElementById("devDots");
const devPrevBtn = document.getElementById("devPrev");
const devNextBtn = document.getElementById("devNext");
const mapEmbedPopup = document.getElementById("mapEmbedPopup");
const closeMapEmbedPopupBtn = document.getElementById("closeMapEmbedPopup");
const mapEmbedFrame = document.querySelector(".map-embed-frame");
const artistModal = document.getElementById("artistModal");
const closeArtistModalBtn = document.getElementById("closeArtistModal");
const developerExploreNavShell = document.getElementById("developerExploreNavShell");
const developerExploreNavPill = document.getElementById("developerExploreNavPill");
const developerExploreNavDropdown = document.getElementById("developerExploreNavDropdown");
const developerExploreNavAbout = document.getElementById("developerExploreNavAbout");
const developerExploreNavProjects = document.getElementById("developerExploreNavProjects");

let map;
let mapEmbedModel = document.getElementById("mapEmbedModel");
let mapEmbedRequestId = 0;
let rrIndex = 0;
let rrImages = [];
let devSlides = [];
let devProjects = [];
let devIndex = 0;
let devCamTimer = null;
let activeDeveloperProfile = null;
let projectLayoutResizeBound = false;
let developerMarkers = [];
let developerHoverPopup = null;
let developerMapsSelectedId = null;
let developerNavDropdownEnabled = false;
let currentViewerProfile = null;
let currentViewerProfilePromise = null;
let projectMediaFullscreenKeydownBound = false;
let projectMediaFullscreenState = null;

let _mapReadyResolve;
const mapReadyPromise = new Promise((resolve) => { _mapReadyResolve = resolve; });

function markMapReady() {
  if (_mapReadyResolve) {
    _mapReadyResolve();
    _mapReadyResolve = null;
  }
}

function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (window.__atsGoogleMapsLoader) return window.__atsGoogleMapsLoader;
  const key = window.ATS_ENV?.GOOGLE_MAPS_API_KEY;
  if (!key) return Promise.reject(new Error("Missing Google Maps API key"));
  window.__atsGoogleMapsLoader = new Promise((resolve, reject) => {
    const cbName = "__atsGmapsCb" + Date.now();
    window[cbName] = () => {
      try { delete window[cbName]; } catch (_) { /* noop */ }
      resolve();
    };
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://maps.googleapis.com/maps/api/js"
      + "?key=" + encodeURIComponent(key)
      + "&v=weekly&libraries=" + GOOGLE_LIBRARIES
      + "&loading=async&callback=" + cbName;
    script.onerror = () => reject(new Error("Google Maps API failed to load."));
    document.head.appendChild(script);
  });
  return window.__atsGoogleMapsLoader;
}

function latLngOf(coord) {
  // Accepts [lng, lat] tuples, {lat, lng} objects, or google.maps.LatLng.
  if (!coord) return null;
  if (Array.isArray(coord) && coord.length >= 2) {
    const lng = Number(coord[0]);
    const lat = Number(coord[1]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (typeof coord.lat === "function") return { lat: coord.lat(), lng: coord.lng() };
  if (typeof coord.lat === "number" && typeof coord.lng === "number") return { lat: coord.lat, lng: coord.lng };
  return null;
}

function moveCamera(opts = {}) {
  if (!map) return;
  const cam = {};
  if (opts.center != null) cam.center = latLngOf(opts.center);
  if (opts.zoom != null) cam.zoom = Number(opts.zoom);
  if (opts.pitch != null) cam.tilt = Math.max(0, Math.min(Number(opts.pitch) || 0, 67.5));
  if (opts.bearing != null) cam.heading = ((Number(opts.bearing) % 360) + 360) % 360;
  try {
    map.moveCamera(cam);
  } catch (_) {
    if (cam.center) map.setCenter(cam.center);
    if (cam.zoom != null) map.setZoom(cam.zoom);
    if (cam.tilt != null) map.setTilt(cam.tilt);
    if (cam.heading != null) map.setHeading(cam.heading);
  }
}

function googleTravelMode(mode) {
  const g = window.google?.maps;
  if (!g) return null;
  if (mode === "walking") return g.TravelMode.WALKING;
  if (mode === "cycling") return g.TravelMode.BICYCLING;
  return g.TravelMode.DRIVING;
}

const PUBLIC_PROJECT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

function canManagePublicProjectStatuses() {
  return String(currentViewerProfile?.role || "").toLowerCase() === "admin";
}

function getPublicProjectStatusLabel(status) {
  return PUBLIC_PROJECT_STATUSES.find((item) => item.value === status)?.label
    || String(status || "draft").trim().replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
    || "Draft";
}

async function resolveCurrentViewerProfile() {
  if (currentViewerProfilePromise) return currentViewerProfilePromise;
  if (!hasClientConfig()) return null;
  currentViewerProfilePromise = getMyProfile()
    .then((profile) => {
      currentViewerProfile = profile || null;
      return currentViewerProfile;
    })
    .catch(() => {
      currentViewerProfile = null;
      return null;
    });
  return currentViewerProfilePromise;
}

function queueMapResize() {
  if (!map || !window.google?.maps) return;
  requestAnimationFrame(() => {
    if (map) google.maps.event.trigger(map, "resize");
    configureMapEmbedViewer(mapEmbedModel);
  });
  setTimeout(() => {
    if (map && window.google?.maps) google.maps.event.trigger(map, "resize");
    configureMapEmbedViewer(mapEmbedModel);
  }, 200);
}

function addMapFullscreenToggle(container) {
  if (!container || container.querySelector(".map-fullscreen-toggle")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "map-fullscreen-toggle";
  button.setAttribute("aria-label", "Toggle fullscreen map");
  button.setAttribute("aria-pressed", "false");
  button.innerHTML = `
    <svg class="icon-expand" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5"/><path d="M20 9V4h-5"/>
      <path d="M4 15v5h5"/><path d="M20 15v5h-5"/>
    </svg>
    <svg class="icon-collapse" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 4v5H4"/><path d="M15 4v5h5"/>
      <path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>
    </svg>
  `;
  const syncFullscreen = (active) => {
    container.classList.toggle("is-fullscreen", active);
    document.body.classList.toggle("map-fullscreen-active", active);
    button.setAttribute("aria-pressed", String(active));
    requestAnimationFrame(queueMapResize);
  };
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    syncFullscreen(!container.classList.contains("is-fullscreen"));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && container.classList.contains("is-fullscreen")) {
      syncFullscreen(false);
    }
  });
  container.appendChild(button);
}

function applyProjectViewportLayout() {
  if (pageType !== "project") return;
  const mapEl = byId("map");
  const gallerySection = byId("sect-gallery");
  const soloRoot = soloBlock?.querySelector(".solo");
  const primaryFrame =
    byId("projectPrimaryFrame") ||
    soloRoot?.querySelector(".media-panels");
  const infoFrame = soloRoot?.querySelector(".solo-info");

  if (!mapEl || !soloBlock || !soloRoot || !primaryFrame) return;

  mapEl.style.height = "50vh";
  mapEl.style.minHeight = "";

  if (gallerySection) {
    gallerySection.style.position = "relative";
    gallerySection.style.overflow = "visible";
    gallerySection.style.zIndex = "8";
  }

  soloBlock.style.marginTop = "0";
  soloBlock.style.position = "relative";
  soloBlock.style.overflow = "visible";
  soloBlock.style.zIndex = "20";

  soloRoot.style.position = "relative";
  soloRoot.style.overflow = "visible";

  if (primaryFrame.classList.contains("is-media-fullscreen")) {
    applyProjectMediaFullscreenInlineStyles(primaryFrame);
  } else {
    primaryFrame.style.setProperty("position", "relative", "important");
    primaryFrame.style.setProperty("z-index", "20", "important");
    primaryFrame.style.setProperty("top", "auto", "important");
    primaryFrame.style.setProperty("margin-top", "0px", "important");
    primaryFrame.style.setProperty("transform", "none", "important");
    primaryFrame.style.setProperty("margin-bottom", "0px", "important");
  }

  if (infoFrame) {
    infoFrame.style.setProperty("margin-top", "0px", "important");
  }
}

function bindProjectLayoutResize() {
  if (projectLayoutResizeBound) return;
  projectLayoutResizeBound = true;
  window.addEventListener("resize", () => {
    requestAnimationFrame(() => applyProjectViewportLayout());
  });
}

function withMapReady(callback) {
  mapReadyPromise.then(() => {
    if (map) callback();
  });
}

function byId(id) {
  return document.getElementById(id);
}

function hasClientConfig() {
  return Boolean(window.ATS_ENV?.SUPABASE_URL && window.ATS_ENV?.SUPABASE_ANON_KEY);
}

function encodeURL(url) {
  return String(url || "").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/ /g, "%20");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getDeveloperRouteInfo() {
  const params = new URLSearchParams(window.location.search);
  let rawSlug = params.get("slug") || "";
  let view = String(params.get("view") || "").trim().toLowerCase();

  if (!rawSlug && pageType === "developer") {
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments[0] === "developers") {
      rawSlug = segments.slice(1).join("/");
    }
  }

  const slugParts = String(rawSlug || "")
    .split("/")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!view && slugParts.length > 1) {
    const maybeView = String(slugParts[slugParts.length - 1] || "").toLowerCase();
    if (["explore", "maps", "lists"].includes(maybeView)) {
      view = maybeView;
      slugParts.pop();
    }
  }

  return {
    slug: slugParts[0] || "",
    view: view || "lists",
  };
}

function getCurrentSlug() {
  if (pageType === "developer") {
    return getDeveloperRouteInfo().slug;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("slug") || window.location.pathname.split("/").filter(Boolean).pop() || "";
}

function buildDeveloperPath(developer, view = "lists") {
  const slug = encodeURIComponent(getDeveloperSlug(developer));
  if (view === "lists") return `/developers/${slug}`;
  return `/developers/${slug}/${view}`;
}

function getSectionMap(bundle) {
  return new Map((bundle?.sections || []).map((section) => [section.section_key, section.content_json || {}]));
}

function getPreferredBackPath(fallbackPath) {
  try {
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.origin === window.location.origin) {
        return `${referrer.pathname}${referrer.search}${referrer.hash}`;
      }
    }
  } catch (_) {}
  return fallbackPath;
}

function navigateTo(path) {
  window.location.href = path;
}

function getRequestedDeveloperProjectSlug() {
  return String(new URLSearchParams(window.location.search).get("project") || "").trim().toLowerCase();
}

function hideDeveloperListDropdown() {
  if (!developerExploreNavPill) return;
  developerExploreNavShell?.classList.remove("is-open");
  developerExploreNavPill.setAttribute("aria-expanded", "false");
}

function setDeveloperListDropdown(enabled, developer = null, project = null) {
  developerNavDropdownEnabled = Boolean(enabled && developerExploreNavShell && developerExploreNavDropdown && developerExploreNavPill);
  if (!developerExploreNavShell || !developerExploreNavPill || !developerExploreNavDropdown) return;

  if (!developerNavDropdownEnabled || !developer) {
    developerExploreNavShell.style.display = "flex";
    developerExploreNavShell.classList.add("topnav-dropdown-shell--disabled");
    developerExploreNavPill.setAttribute("href", buildDeveloperPath(developer || { brand_slug: getCurrentSlug() }, "explore"));
    developerExploreNavPill.removeAttribute("aria-expanded");
    if (developerExploreNavAbout) {
      developerExploreNavAbout.setAttribute("href", buildDeveloperPath(developer || { brand_slug: getCurrentSlug() }, "explore"));
    }
    if (developerExploreNavProjects) {
      developerExploreNavProjects.setAttribute("href", buildDeveloperPath(developer || { brand_slug: getCurrentSlug() }, "maps"));
    }
    hideDeveloperListDropdown();
    return;
  }

  developerExploreNavShell.style.display = "flex";
  developerExploreNavShell.classList.remove("topnav-dropdown-shell--disabled");
  developerExploreNavPill.setAttribute("href", buildDeveloperPath(developer, "explore"));
  developerExploreNavPill.setAttribute("aria-expanded", "false");
  if (developerExploreNavAbout) {
    developerExploreNavAbout.setAttribute("href", buildDeveloperPath(developer, "explore"));
  }
  if (developerExploreNavProjects) {
    developerExploreNavProjects.setAttribute("href", buildDeveloperPath(developer, "maps"));
  }
}

function setDeveloperViewMode(mode) {
  document.body.classList.remove("is-developer", "is-developer-explore", "is-developer-maps");
  if (mode === "explore") {
    document.body.classList.add("is-developer-explore");
  } else if (mode === "maps") {
    document.body.classList.add("is-developer-maps");
  } else {
    document.body.classList.add("is-developer");
  }

  if (developerBlock) developerBlock.style.display = mode === "lists" ? "flex" : "none";
  if (developerExploreBlock) developerExploreBlock.style.display = mode === "explore" ? "block" : "none";
  if (developerMapsBlock) developerMapsBlock.style.display = mode === "maps" ? "block" : "none";
  if (mode !== "lists") {
    setDeveloperListDropdown(false);
  }
}

function clearDeveloperMapArtifacts() {
  developerMarkers.forEach((entry) => {
    if (entry?.marker) entry.marker.map = null;
  });
  developerMarkers = [];
  developerHoverPopup?.close?.();
  developerHoverPopup = null;
}

function getDeveloperAreas(projectCards = []) {
  const unique = [...new Set(projectCards.map((project) => String(project.location || "").trim()).filter(Boolean))];
  return unique.length ? unique : ["Riyadh"];
}

function fitMapToCoords(coordsList, options = {}) {
  if (!map || !window.google?.maps || !Array.isArray(coordsList) || !coordsList.length) return;
  const validLatLngs = coordsList
    .map((coord) => latLngOf(coord))
    .filter(Boolean);
  if (!validLatLngs.length) return;

  if (validLatLngs.length === 1) {
    moveCamera({
      center: validLatLngs[0],
      zoom: options.zoom || 13.6,
      pitch: options.pitch || 44,
      bearing: options.bearing || 12,
    });
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  validLatLngs.forEach((ll) => bounds.extend(ll));
  const padding = options.padding || { top: 140, right: 120, bottom: 120, left: 120 };
  map.fitBounds(bounds, padding);
  const maxZoom = options.maxZoom || 13.8;
  google.maps.event.addListenerOnce(map, "idle", () => {
    if (!map) return;
    if (map.getZoom() > maxZoom) map.setZoom(maxZoom);
    // Google's fitBounds doesn't preserve tilt/heading; reapply explicitly.
    try { map.setTilt(options.pitch ?? 26); } catch (_) { /* noop */ }
    try { map.setHeading(options.bearing ?? 8); } catch (_) { /* noop */ }
  });
}

function upsertMeta(selector, attributes, content) {
  if (!content) return;
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function setCanonical(url) {
  if (!url) return;
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function applySeo(source, fallbackTitle) {
  if (!source) return;
  document.title = source.seo_title || fallbackTitle || document.title;
  upsertMeta('meta[name="description"]', { name: "description" }, source.seo_description || "");
  upsertMeta('meta[name="keywords"]', { name: "keywords" }, source.seo_keywords || "");
  upsertMeta('meta[property="og:title"]', { property: "og:title" }, source.og_title || source.seo_title || fallbackTitle || "");
  upsertMeta('meta[property="og:description"]', { property: "og:description" }, source.og_description || source.seo_description || "");
  upsertMeta('meta[property="og:image"]', { property: "og:image" }, source.og_image_url || "");
  setCanonical(source.canonical_url || "");
}

function buildProjectCard(row, developer) {
  const galleryImages = Array.isArray(row.gallery_images) && row.gallery_images.length
    ? row.gallery_images.filter(Boolean)
    : [row.hero_image_url || developer?.logo_url || DEFAULT_IMAGE_URL];
  const cover = row.hero_image_url || galleryImages[0] || developer?.logo_url || DEFAULT_IMAGE_URL;
  const projectCoords = getProjectCoords(row);
  const popupCoords = getProjectPopupCoords(row);
  return {
    id: `public-project-${row.id}`,
    sourceId: row.id,
    href: `/projects/${encodeURIComponent(getProjectSlug(row))}`,
    name: row.name,
    description: row.description || "Published project",
    status: row.status || "draft",
    img: cover,
    galleryImages,
    video: row.video_url || DEFAULT_VIDEO_URL,
    video360: row.media_360_url || null,
    media360Inside: row.media_360_inside_url || null,
    model: row.model_url || DEFAULT_MODEL_URL,
    mediaEnabled: {
      images: row.show_images !== false,
      mode360: row.show_360 !== false,
      mode360Inside: row.show_360_inside !== false,
      video: row.show_video !== false,
      model: row.show_model !== false,
    },
    location: row.location || "Riyadh",
    store: {
      name: row.location || "Riyadh",
      coords: projectCoords,
    },
    popupStore: {
      name: row.location || "Riyadh",
      coords: popupCoords,
    },
    specs: {
      mat: developer?.name || "Developer",
      dim: getPublicProjectStatusLabel(row.status || "draft"),
    },
    artist: {
      name: developer?.name || "Developer",
      role: "Developer",
      img: developer?.logo_url || cover,
      bio: developer?.description || row.description || "",
    },
  };
}

function configureMapEmbedViewer(viewer, multiplier = MAP_EMBED_ZOOM_OUT_MULTIPLIER) {
  if (!viewer) return;
  const safeMultiplier = Math.min(Math.max(Number(multiplier) || 1, 1), 3.5);
  const orbitDistance = `${Math.round(MAP_EMBED_CAMERA_DISTANCE * safeMultiplier)}%`;
  const minDistance = `${Math.round(MAP_EMBED_CAMERA_DISTANCE_MIN * safeMultiplier)}%`;
  const maxDistance = `${Math.round(MAP_EMBED_CAMERA_DISTANCE_MAX * safeMultiplier)}%`;
  viewer.setAttribute("camera-target", "auto auto auto");
  viewer.setAttribute("field-of-view", `${MAP_EMBED_FIELD_OF_VIEW}deg`);
  viewer.setAttribute("camera-orbit", `${MAP_EMBED_CAMERA_AZIMUTH} ${MAP_EMBED_CAMERA_ELEVATION} ${orbitDistance}`);
  viewer.setAttribute("min-camera-orbit", `auto auto ${minDistance}`);
  viewer.setAttribute("max-camera-orbit", `auto auto ${maxDistance}`);
}

function initMap() {
  if (map) return;
  const container = document.getElementById("map");
  if (!container) return;
  if (pageType === "project") addMapFullscreenToggle(container);
  loadGoogleMaps().then(() => {
    if (map || !document.getElementById("map")) return;
    map = new google.maps.Map(container, {
      mapId: window.ATS_ENV?.GOOGLE_MAP_ID || undefined,
      center: latLngOf(DEFAULT_CENTER),
      zoom: 4,
      tilt: 0,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      keyboardShortcuts: false,
      backgroundColor: "#000",
    });
    attachMapEmbedPopup();
    if (pageType === "project") addMapFullscreenToggle(container);
    markMapReady();
  }).catch(() => { /* container stays blank */ });
}

function attachMapEmbedPopup() {
  if (!mapEmbedPopup) return;
  const container = map?.getDiv?.() || document.getElementById("map");
  if (container && mapEmbedPopup.parentElement !== container) {
    container.appendChild(mapEmbedPopup);
  }
  if (mapEmbedFrame && closeMapEmbedPopupBtn && closeMapEmbedPopupBtn.parentElement !== mapEmbedFrame) {
    mapEmbedFrame.appendChild(closeMapEmbedPopupBtn);
  }
}

function openMapEmbedPopup() {
  if (!mapEmbedPopup) return;
  const show = () => {
    if (!mapEmbedPopup) return;
    attachMapEmbedPopup();
    mapEmbedPopup.classList.add("open");
    mapEmbedPopup.setAttribute("aria-hidden", "false");
  };
  if (map?.getDiv || document.getElementById("map")) {
    show();
  } else {
    mapReadyPromise.then(show);
  }
}

function closeMapEmbedPopup() {
  if (!mapEmbedPopup) return;
  mapEmbedPopup.classList.remove("open");
  mapEmbedPopup.setAttribute("aria-hidden", "true");
}

function buildMapEmbedModel(src) {
  if (!mapEmbedFrame) return null;
  const viewer = document.createElement("model-viewer");
  viewer.id = "mapEmbedModel";
  viewer.className = "map-embed-model";
  viewer.setAttribute("alt", "3D building preview");
  viewer.setAttribute("camera-controls", "");
  viewer.setAttribute("disable-pan", "");
  viewer.setAttribute("interaction-prompt", "none");
  viewer.setAttribute("shadow-intensity", "0");
  viewer.setAttribute("environment-image", "neutral");
  viewer.setAttribute("exposure", "1.05");
  configureMapEmbedViewer(viewer);
  viewer.addEventListener("load", () => configureMapEmbedViewer(viewer), { once: true });
  if (closeMapEmbedPopupBtn) {
    mapEmbedFrame.replaceChildren(viewer, closeMapEmbedPopupBtn);
  } else {
    mapEmbedFrame.replaceChildren(viewer);
  }
  mapEmbedModel = viewer;
  return viewer;
}

function toRawModelUrl(src) {
  const prefix = "https://cdn.jsdelivr.net/gh/lwiise/3d-models@main/";
  if (!src || !src.startsWith(prefix)) return "";
  return `https://raw.githubusercontent.com/lwiise/3d-models/main/${src.slice(prefix.length)}`;
}

function setMapEmbedModel(src, { reopen = false, open = true } = {}) {
  if (!mapEmbedFrame) return;
  const nextSrc = src || DEFAULT_MODEL_URL;
  const requestId = ++mapEmbedRequestId;
  if (reopen && open) closeMapEmbedPopup();
  if (open) openMapEmbedPopup();

  const mountViewer = (url, allowFallback = true) => {
    const viewer = buildMapEmbedModel(url);
    if (!viewer) return;
    viewer.addEventListener(
      "error",
      () => {
        if (requestId !== mapEmbedRequestId) return;
        const fallback = allowFallback ? toRawModelUrl(url) : "";
        if (fallback && fallback !== url) mountViewer(fallback, false);
      },
      { once: true }
    );
    viewer.setAttribute("src", url);
  };

  mountViewer(nextSrc, true);
}

function gotoStore(store) {
  if (!store) return;
  withMapReady(() => {
    moveCamera({ center: store.coords, zoom: 16.2, pitch: 65, bearing: 45 });
  });
}

function renderLegacyError(message) {
  if (pageType === "developer") {
    setDeveloperViewMode("explore");
    if (developerExploreBlock) {
      developerExploreBlock.style.display = "block";
      developerExploreBlock.innerHTML = `<div class="legacy-empty">${escapeHtml(message)}</div>`;
    }
    return;
  }
  const target = soloBlock;
  if (!target) return;
  target.style.display = "block";
  target.innerHTML = `<div class="legacy-empty">${escapeHtml(message)}</div>`;
}

function bindModalUi() {
  closeMapEmbedPopupBtn?.addEventListener("click", closeMapEmbedPopup);
  mapEmbedPopup?.addEventListener("click", (event) => {
    if (event.target === mapEmbedPopup) closeMapEmbedPopup();
  });
  closeArtistModalBtn?.addEventListener("click", () => artistModal?.classList.remove("open"));
  artistModal?.addEventListener("click", (event) => {
    if (event.target === artistModal) artistModal.classList.remove("open");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMapEmbedPopup();
      artistModal?.classList.remove("open");
    }
  });
}

function getProjectMediaFullscreenRoot() {
  if (!mediaStage) return null;
  const mediaPanel = mediaStage.closest(".media-panels");
  if (mediaPanel) return mediaPanel;
  let node = mediaStage.parentElement;
  while (node && node !== document.body) {
    if (node.querySelector?.(".mode-tabs") && node.contains(mediaStage)) return node;
    node = node.parentElement;
  }
  const primaryFrame = byId("projectPrimaryFrame");
  if (primaryFrame && primaryFrame.contains(mediaStage)) return primaryFrame;
  return mediaStage.parentElement;
}

function applyProjectMediaFullscreenInlineStyles(root) {
  if (!root) return;
  root.style.setProperty("position", "relative", "important");
  root.style.setProperty("top", "auto", "important");
  root.style.setProperty("right", "auto", "important");
  root.style.setProperty("bottom", "auto", "important");
  root.style.setProperty("left", "auto", "important");
  root.style.setProperty("width", "100%", "important");
  root.style.setProperty("height", "100%", "important");
  root.style.setProperty("min-height", "100%", "important");
  root.style.setProperty("max-width", "none", "important");
  root.style.setProperty("margin", "0", "important");
  root.style.setProperty("z-index", "1", "important");
  root.style.setProperty("display", "flex", "important");
  root.style.setProperty("flex-direction", "column", "important");
  root.style.setProperty("box-sizing", "border-box", "important");
  root.style.setProperty("overflow", "hidden", "important");
  root.style.setProperty("transform", "none", "important");
}

function applyProjectMediaFullscreenOverlayStyles(overlay) {
  if (!overlay) return;
  overlay.style.setProperty("position", "fixed", "important");
  overlay.style.setProperty("inset", "0", "important");
  overlay.style.setProperty("top", "0", "important");
  overlay.style.setProperty("right", "0", "important");
  overlay.style.setProperty("bottom", "0", "important");
  overlay.style.setProperty("left", "0", "important");
  overlay.style.setProperty("width", "100vw", "important");
  overlay.style.setProperty("height", "100vh", "important");
  overlay.style.setProperty("max-width", "none", "important");
  overlay.style.setProperty("max-height", "none", "important");
  overlay.style.setProperty("margin", "0", "important");
  overlay.style.setProperty("padding", "0", "important");
  overlay.style.setProperty("border", "0", "important");
  overlay.style.setProperty("background", "transparent", "important");
  overlay.style.setProperty("overflow", "hidden", "important");
  overlay.style.setProperty("z-index", "2147483647", "important");
  overlay.style.setProperty("box-sizing", "border-box", "important");
  overlay.style.setProperty("display", "flex", "important");
  overlay.style.setProperty("align-items", "stretch", "important");
  overlay.style.setProperty("justify-content", "stretch", "important");
}

function createProjectMediaFullscreenOverlay() {
  const overlay = document.createElement("dialog");
  overlay.className = "project-media-fullscreen-dialog";
  overlay.setAttribute("aria-label", "Fullscreen media");
  overlay.addEventListener("cancel", (event) => {
    event.preventDefault();
    setProjectMediaFullscreen(false);
  });
  applyProjectMediaFullscreenOverlayStyles(overlay);
  document.body.appendChild(overlay);
  return overlay;
}

function setProjectMediaFullscreen(active) {
  const root = getProjectMediaFullscreenRoot();
  if (!root) return;
  if (active) {
    if (!projectMediaFullscreenState) {
      const placeholder = document.createComment("project media fullscreen placeholder");
      root.parentNode?.insertBefore(placeholder, root);
      const overlay = createProjectMediaFullscreenOverlay();
      projectMediaFullscreenState = {
        root,
        overlay,
        placeholder,
        previousStyle: root.getAttribute("style") || "",
      };
      overlay.appendChild(root);
      try {
        overlay.showModal();
      } catch (_) {
        overlay.setAttribute("open", "");
      }
    }
    root.classList.add("is-media-fullscreen");
    document.body.classList.add("media-fullscreen-active");
    document.documentElement.classList.add("media-fullscreen-active");
    applyProjectMediaFullscreenOverlayStyles(projectMediaFullscreenState.overlay);
    applyProjectMediaFullscreenInlineStyles(root);
  } else {
    const state = projectMediaFullscreenState;
    const activeRoot = state?.root || root;
    activeRoot.classList.remove("is-media-fullscreen");
    document.body.classList.remove("media-fullscreen-active");
    document.documentElement.classList.remove("media-fullscreen-active");

    if (state) {
      if (state.placeholder?.parentNode) {
        state.placeholder.parentNode.insertBefore(activeRoot, state.placeholder);
        state.placeholder.remove();
      }
      if (state.previousStyle) activeRoot.setAttribute("style", state.previousStyle);
      else activeRoot.removeAttribute("style");
      if (state.overlay?.open && typeof state.overlay.close === "function") {
        try { state.overlay.close(); } catch (_) { /* noop */ }
      }
      state.overlay?.remove();
      projectMediaFullscreenState = null;
    }

    requestAnimationFrame(() => applyProjectViewportLayout());
  }

  const button = mediaStage?.querySelector(".media-fullscreen-toggle");
  if (button) {
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Exit fullscreen media" : "Show media fullscreen");
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

function ensureProjectMediaFullscreenToggle() {
  if (!mediaStage) return;
  const root = getProjectMediaFullscreenRoot();
  if (!root) return;

  mediaStage.classList.add("has-media-fullscreen-toggle");
  let button = mediaStage.querySelector(".media-fullscreen-toggle");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "media-fullscreen-toggle";
    button.innerHTML = `
      <svg class="icon-expand" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9V4h5"/><path d="M20 9V4h-5"/>
        <path d="M4 15v5h5"/><path d="M20 15v5h-5"/>
      </svg>
      <svg class="icon-collapse" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 4v5H4"/><path d="M15 4v5h5"/>
        <path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>
      </svg>
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setProjectMediaFullscreen(!root.classList.contains("is-media-fullscreen"));
    });
    mediaStage.appendChild(button);
  }

  const isFullscreen = root.classList.contains("is-media-fullscreen");
  button.setAttribute("aria-pressed", String(isFullscreen));
  button.setAttribute("aria-label", isFullscreen ? "Exit fullscreen media" : "Show media fullscreen");

  if (!projectMediaFullscreenKeydownBound) {
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const currentRoot = getProjectMediaFullscreenRoot();
      if (currentRoot?.classList.contains("is-media-fullscreen")) {
        setProjectMediaFullscreen(false);
      }
    });
    projectMediaFullscreenKeydownBound = true;
  }
}

function renderProjectImageMedia(project) {
  if (!mediaStage) return;
  const total = rrImages.length || 1;
  rrIndex = ((rrIndex % total) + total) % total;
  const currentImage = rrImages[rrIndex] || project.img;
  const controls = total > 1
    ? `
      <button class="rr-nav prev" type="button" data-rr-prev aria-label="Previous image">‹</button>
      <button class="rr-nav next" type="button" data-rr-next aria-label="Next image">›</button>
      <div class="rr-count">${rrIndex + 1} / ${total}</div>
    `
    : "";
  mediaStage.innerHTML = `<img src="${escapeHtml(currentImage)}" alt="${escapeHtml(project.name)}">${controls}`;
  mediaStage.querySelector("[data-rr-prev]")?.addEventListener("click", () => {
    rrIndex = rrIndex - 1;
    renderProjectImageMedia(project);
  });
  mediaStage.querySelector("[data-rr-next]")?.addEventListener("click", () => {
    rrIndex = rrIndex + 1;
    renderProjectImageMedia(project);
  });
  ensureProjectMediaFullscreenToggle();
}

function mount360Panorama(container, panoramaUrl) {
  if (!container) return;
  const url = String(panoramaUrl || "").trim();
  const fallback = (msg) => {
    container.innerHTML = `<div class="legacy-empty" style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;color:#888;background:#000;">${escapeHtml(msg)}</div>`;
  };
  if (!url) { fallback("360 panorama unavailable."); return; }
  if (!window.pannellum) { fallback("360 viewer failed to load."); return; }
  container.innerHTML = `<div id="pano360" class="pano360" style="width:100%;height:100%;background:#000;"></div>`;
  try {
    pannellum.viewer("pano360", {
      type: "equirectangular",
      panorama: url,
      autoLoad: true,
      showZoomCtrl: true,
      showFullscreenCtrl: true,
      compass: false,
      mouseZoom: true,
      draggable: true,
      hfov: 100,
      minHfov: 50,
      maxHfov: 120,
      crossOrigin: "anonymous",
    });
  } catch (_) {
    fallback("360 panorama failed to load.");
  }
}

function updateProjectMedia(project, mode) {
  if (!mediaStage) return;

  if (mode === "video") {
    mediaStage.innerHTML = `
      <video playsinline controls preload="metadata">
        <source src="${encodeURL(project.video)}" type="video/mp4">
      </video>
    `;
    ensureProjectMediaFullscreenToggle();
    return;
  }

  if (mode === "360") {
    const url = String(project.video360 || project.video || "").trim();
    if (!url) {
      mediaStage.innerHTML = `<div class="legacy-empty" style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;color:#888;background:#000;">360 video unavailable.</div>`;
      ensureProjectMediaFullscreenToggle();
      return;
    }
    // Inline all critical layout/sizing styles so the player and bar are
    // guaranteed visible and clickable regardless of any CSS conflicts in
    // the parent .media-stage context.
    // Controls are a floating pill-shaped bar overlaid on the bottom of the
    // video. Pseudo-elements for the slider thumb can't be inlined, so the
    // .ats-360-range class is styled in legacy-detail-pages.css.
    mediaStage.innerHTML = `
      <div style="position:absolute;inset:0;background:#000;overflow:hidden;border-radius:inherit;">
        <video id="rr360Video" playsinline preload="auto" src="${encodeURL(url)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;display:block;"></video>
        <div style="position:absolute;left:18px;right:18px;bottom:18px;display:flex;align-items:center;gap:12px;padding:8px 14px;background:rgba(170,170,170,0.78);border-radius:999px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 6px 18px rgba(0,0,0,0.25);z-index:2;">
          <button id="rr360PlayBtn" type="button" aria-label="Play" style="flex:0 0 auto;width:32px;height:32px;border-radius:999px;border:none;background:#101010;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;line-height:1;padding:0;padding-left:2px;">&#9654;</button>
          <input id="rr360Range" class="ats-360-range" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek" style="flex:1 1 auto;cursor:pointer;">
        </div>
      </div>
    `;
    const video = byId("rr360Video");
    const playButton = byId("rr360PlayBtn");
    const range = byId("rr360Range");

    const PLAY_ICON = "&#9654;";
    const PAUSE_ICON = "&#10074;&#10074;";
    let isScrubbing = false;
    let wasPlayingBeforeScrub = false;

    const syncButton = () => {
      if (!playButton || !video) return;
      const paused = video.paused || video.ended;
      playButton.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
      playButton.setAttribute("aria-label", paused ? "Play" : "Pause");
    };

    // Auto-follow: write the playhead's position into the range as the
    // video plays. Suppressed while the user is scrubbing so the slider
    // doesn't fight the drag.
    const writeRangeFromVideo = () => {
      if (!video || !range || isScrubbing) return;
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const pct = (video.currentTime / dur) * 1000;
      range.value = String(Math.max(0, Math.min(1000, pct)));
    };

    // Interactive scrub: dragging the range moves the playhead live.
    const seekFromRange = () => {
      if (!video || !range) return;
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const pct = parseFloat(range.value || "0") / 1000;
      video.currentTime = pct * dur;
    };

    if (video) {
      video.addEventListener("loadedmetadata", () => { syncButton(); writeRangeFromVideo(); });
      video.addEventListener("durationchange", writeRangeFromVideo);
      video.addEventListener("timeupdate", writeRangeFromVideo);
      video.addEventListener("seeked", writeRangeFromVideo);
      video.addEventListener("play", syncButton);
      video.addEventListener("pause", syncButton);
      video.addEventListener("ended", () => { syncButton(); writeRangeFromVideo(); });
      video.addEventListener("error", () => {
        mediaStage.innerHTML = `<div class="legacy-empty" style="display:flex;align-items:center;justify-content:center;height:100%;width:100%;color:#888;background:#000;">360 video failed to load.</div>`;
        ensureProjectMediaFullscreenToggle();
      });
    }

    if (playButton) {
      playButton.addEventListener("click", () => {
        if (!video) return;
        if (video.paused || video.ended) {
          video.play().then(syncButton).catch(syncButton);
        } else {
          video.pause();
        }
      });
    }

    if (range) {
      const startScrub = () => {
        if (!video) return;
        isScrubbing = true;
        wasPlayingBeforeScrub = !video.paused && !video.ended;
        if (wasPlayingBeforeScrub) video.pause();
      };
      const endScrub = () => {
        if (!isScrubbing) return;
        isScrubbing = false;
        if (wasPlayingBeforeScrub && video) {
          video.play().then(syncButton).catch(syncButton);
        }
        wasPlayingBeforeScrub = false;
      };
      // Pointer events cover mouse, touch, and pen on all modern browsers.
      range.addEventListener("pointerdown", startScrub);
      range.addEventListener("pointerup", endScrub);
      range.addEventListener("pointercancel", endScrub);
      // Live seek as the user drags (fires throughout the gesture).
      range.addEventListener("input", seekFromRange);
      // Final commit (mouse/touch release, keyboard arrow release).
      range.addEventListener("change", endScrub);
    }

    syncButton();
    ensureProjectMediaFullscreenToggle();
    return;
  }

  if (mode === "360-inside") {
    mount360Panorama(mediaStage, project.media360Inside);
    ensureProjectMediaFullscreenToggle();
    return;
  }

  if (mode === "3d") {
    mediaStage.innerHTML = `
      <model-viewer
        src="${encodeURL(project.model)}"
        alt="${escapeHtml(project.name)} 3D model"
        camera-controls
        disable-pan
        interaction-prompt="none"
        shadow-intensity="0"
        exposure="1.05"
        style="width:100%;height:100%;background:transparent;--poster-color:transparent;"
        camera-orbit="-35deg 72deg auto"
        min-camera-orbit="auto auto 65%"
        max-camera-orbit="auto auto 220%"
        environment-image="neutral">
      </model-viewer>
    `;
    ensureProjectMediaFullscreenToggle();
    return;
  }

  if (mode === "navigator") {
    mediaStage.innerHTML = `
      <iframe
        src="https://share.d5render.com/user-hub/showreel/shortLink/ixovpp"
        title="Navigator"
        loading="lazy"
        allow="fullscreen; xr-spatial-tracking; accelerometer; gyroscope; autoplay"
        allowfullscreen
        style="width:100%;height:100%;border:0;display:block;background:#000;">
      </iframe>
    `;
    ensureProjectMediaFullscreenToggle();
    return;
  }

  if (mode === "configurator") {
    const bgUrl = String(project.img || "").trim();
    const cap = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());
    mediaStage.innerHTML = `
      <div class="cfg-frame">
        ${bgUrl ? `<img class="cfg-bg" src="${escapeHtml(bgUrl)}" alt="" />` : ""}

        <aside class="cfg-info-panel" data-cfg-panel="info" hidden>
          <button class="cfg-close" type="button" data-cfg-close aria-label="Close">&times;</button>
          <h3>${escapeHtml(project.name || "Project")}</h3>
          ${project.description ? `<p>${escapeHtml(project.description)}</p>` : ""}
          ${project.location ? `<div class="cfg-info-row"><span>LOCATION</span><strong>${escapeHtml(project.location)}</strong></div>` : ""}
          ${project.specs?.mat ? `<div class="cfg-info-row"><span>DEVELOPER</span><strong>${escapeHtml(project.specs.mat)}</strong></div>` : ""}
          ${project.specs?.dim ? `<div class="cfg-info-row"><span>STATUS</span><strong>${escapeHtml(project.specs.dim)}</strong></div>` : ""}
        </aside>

        <aside class="cfg-info-panel cfg-customs-panel" data-cfg-panel="customs" hidden>
          <button class="cfg-close" type="button" data-cfg-close aria-label="Close">&times;</button>
          <h3>CUSTOMIZER</h3>
          <div class="cfg-cust-section">
            <span>COLOR</span>
            <div class="cfg-cust-row">
              <button type="button" class="cfg-cust-pill" data-cfg-cust-color="red">Red</button>
              <button type="button" class="cfg-cust-pill" data-cfg-cust-color="blue">Blue</button>
              <button type="button" class="cfg-cust-pill" data-cfg-cust-color="sand">Sand</button>
            </div>
          </div>
          <div class="cfg-cust-section">
            <span>SIZE</span>
            <div class="cfg-cust-row">
              <button type="button" class="cfg-cust-pill" data-cfg-cust-size="small">Small</button>
              <button type="button" class="cfg-cust-pill" data-cfg-cust-size="medium">Medium</button>
              <button type="button" class="cfg-cust-pill" data-cfg-cust-size="large">Large</button>
            </div>
          </div>
          <div class="cfg-cust-summary" data-cfg-summary></div>
        </aside>

        <div class="cfg-bar">
          <div class="cfg-tab" data-cfg-tab="info">
            <button type="button" class="cfg-tab-btn">INFO</button>
          </div>
          <div class="cfg-tab" data-cfg-tab="color">
            <button type="button" class="cfg-tab-btn">COLOR</button>
            <div class="cfg-stack" data-cfg-stack="color" hidden>
              <button type="button" class="cfg-stack-pill" data-cfg-color="red">RED</button>
              <button type="button" class="cfg-stack-pill" data-cfg-color="blue">BLUE</button>
              <button type="button" class="cfg-stack-pill" data-cfg-color="sand">SAND</button>
            </div>
          </div>
          <div class="cfg-tab" data-cfg-tab="size">
            <button type="button" class="cfg-tab-btn">SIZE</button>
            <div class="cfg-stack" data-cfg-stack="size" hidden>
              <button type="button" class="cfg-stack-pill" data-cfg-size="small">SMALL</button>
              <button type="button" class="cfg-stack-pill" data-cfg-size="medium">MEDIUM</button>
              <button type="button" class="cfg-stack-pill" data-cfg-size="large">LARGE</button>
            </div>
          </div>
          <div class="cfg-tab" data-cfg-tab="customs">
            <button type="button" class="cfg-tab-btn">CUSTOMS</button>
          </div>
        </div>
      </div>
    `;

    const root = mediaStage.querySelector(".cfg-frame");
    const cfgState = { activeTab: null, color: "red", size: "medium" };

    const sync = () => {
      root.querySelectorAll("[data-cfg-tab]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.cfgTab === cfgState.activeTab);
      });
      root.querySelectorAll("[data-cfg-panel]").forEach((el) => {
        el.hidden = el.dataset.cfgPanel !== cfgState.activeTab;
      });
      root.querySelectorAll("[data-cfg-stack]").forEach((el) => {
        el.hidden = el.dataset.cfgStack !== cfgState.activeTab;
      });
      root.querySelectorAll("[data-cfg-color]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.cfgColor === cfgState.color);
      });
      root.querySelectorAll("[data-cfg-cust-color]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.cfgCustColor === cfgState.color);
      });
      root.querySelectorAll("[data-cfg-size]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.cfgSize === cfgState.size);
      });
      root.querySelectorAll("[data-cfg-cust-size]").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.cfgCustSize === cfgState.size);
      });
      const summary = root.querySelector("[data-cfg-summary]");
      if (summary) summary.textContent = `Selected: ${cap(cfgState.color)} / ${cap(cfgState.size)}`;
    };

    const setTab = (tab) => {
      cfgState.activeTab = cfgState.activeTab === tab ? null : tab;
      sync();
    };

    root.querySelectorAll(".cfg-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => setTab(btn.parentElement.dataset.cfgTab));
    });
    root.querySelectorAll("[data-cfg-color]").forEach((btn) => {
      btn.addEventListener("click", () => { cfgState.color = btn.dataset.cfgColor; sync(); });
    });
    root.querySelectorAll("[data-cfg-size]").forEach((btn) => {
      btn.addEventListener("click", () => { cfgState.size = btn.dataset.cfgSize; sync(); });
    });
    root.querySelectorAll("[data-cfg-cust-color]").forEach((btn) => {
      btn.addEventListener("click", () => { cfgState.color = btn.dataset.cfgCustColor; sync(); });
    });
    root.querySelectorAll("[data-cfg-cust-size]").forEach((btn) => {
      btn.addEventListener("click", () => { cfgState.size = btn.dataset.cfgCustSize; sync(); });
    });
    root.querySelectorAll("[data-cfg-close]").forEach((btn) => {
      btn.addEventListener("click", () => setTab(null));
    });

    sync();
    ensureProjectMediaFullscreenToggle();
    return;
  }

  renderProjectImageMedia(project);
}

function getAvailableProjectModes(project) {
  const enabled = project.mediaEnabled || {};
  // 360 and 360 Inside follow the Navigator/Configurator pattern: tab is
  // always present so editors can find it; each player shows a graceful
  // inline fallback if its URL is missing or fails to load.
  return [
    enabled.images !== false ? "images" : null,
    enabled.mode360 !== false ? "360" : null,
    enabled.video ? "video" : null,
    enabled.model ? "3d" : null,
    "navigator",
    "configurator",
    "360-inside",
  ].filter(Boolean);
}

function setupProjectMedia(project) {
  rrImages = (Array.isArray(project.galleryImages) ? project.galleryImages : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (!rrImages.length) rrImages = [project.img];
  rrIndex = 0;
  const availableModes = getAvailableProjectModes(project);
  // Navigator, Configurator, and 360 Inside are always available, but the
  // initially opened tab should still be a real media mode so loading a
  // project doesn't auto-embed the iframe or auto-open an empty panorama.
  const defaultMode = availableModes.find(
    (m) => m !== "navigator" && m !== "configurator" && m !== "360-inside",
  ) || "images";
  updateProjectMedia(project, defaultMode);
  document.querySelectorAll(".mode-btn").forEach((button) => {
    const buttonMode = button.dataset.mode || "images";
    const enabled = availableModes.includes(buttonMode);
    button.hidden = !enabled;
    button.disabled = !enabled;
    if (enabled) {
      button.classList.toggle("active", buttonMode === defaultMode);
    } else {
      button.classList.remove("active");
    }
    button.onclick = () => {
      if (!enabled) return;
      document.querySelectorAll(".mode-btn").forEach((node) => node.classList.remove("active"));
      button.classList.add("active");
      updateProjectMedia(project, buttonMode);
    };
  });
}

function setProjectActionData(project) {
  const payload = {
    publicRef: project.id,
    title: project.name,
    type: "sale",
    city: "Riyadh",
    address: project.location,
    price: "",
    image: project.img,
  };
  ["soloSaveBtn", "soloInquireBtn", "soloBookBtn"].forEach((id) => {
    const button = byId(id);
    if (!button) return;
    button.setAttribute("data-listing-public-ref", payload.publicRef);
    button.setAttribute("data-listing-title", payload.title);
    button.setAttribute("data-listing-type", payload.type);
    button.setAttribute("data-listing-city", payload.city);
    button.setAttribute("data-listing-address", payload.address);
    button.setAttribute("data-listing-price", payload.price);
    button.setAttribute("data-listing-image", payload.image);
  });
}

function renderArtist(project) {
  byId("artistName").textContent = project.artist.name;
  byId("artistRole").textContent = project.artist.role;
  byId("artistImg").src = project.artist.img;
  byId("modalArtistName").textContent = project.artist.name;
  byId("modalArtistRole").textContent = project.artist.role;
  byId("modalArtistImg").src = project.artist.img;
  byId("modalArtistBio").textContent = project.artist.bio;
}

function renderSecondaryFrame(bundle, homeBundle) {
  const developer = bundle.developer;
  const relatedProjects = bundle.relatedProjects || [];
  const contact = getSectionMap(homeBundle).get("contact_details") || {};
  const root = byId("projectSupportFrame");
  const wrap = byId("projectSupportFrameWrap");
  if (!root) return;
  if (!developer) {
    root.innerHTML = "";
    if (wrap) wrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "block";

  root.innerHTML = `
    <div class="legacy-secondary-head">
      <div>
        <div class="legacy-secondary-kicker">Developer Information</div>
        <h3 class="legacy-secondary-title">${escapeHtml(developer.name)}</h3>
      </div>
      <a class="legacy-secondary-link" href="/developers/${encodeURIComponent(getDeveloperSlug(developer))}">Open Developer</a>
    </div>
    <div class="legacy-secondary-grid">
      <section class="legacy-secondary-card">
        <h4>About Developer</h4>
        <p class="legacy-secondary-copy">${escapeHtml(developer.description || "Published developer profile.")}</p>
        <div class="legacy-detail-lines">
          ${developer.email ? `<div><span>Email</span><a href="mailto:${escapeHtml(developer.email)}">${escapeHtml(developer.email)}</a></div>` : ""}
          ${developer.phone ? `<div><span>Phone</span><a href="tel:${escapeHtml(developer.phone)}">${escapeHtml(developer.phone)}</a></div>` : ""}
          ${developer.website_url ? `<div><span>Website</span><a href="${escapeHtml(developer.website_url)}" target="_blank" rel="noreferrer">${escapeHtml(developer.website_url)}</a></div>` : ""}
        </div>
      </section>
      <section class="legacy-secondary-card">
        <h4>Published Projects</h4>
        <div class="legacy-link-list">
          ${relatedProjects.length ? relatedProjects.map((item) => `<a class="legacy-link-chip" href="/projects/${encodeURIComponent(getProjectSlug(item))}">${escapeHtml(item.name)}</a>`).join("") : '<span class="legacy-secondary-empty">No related projects yet.</span>'}
        </div>
      </section>
      ${(contact.email || contact.phone || contact.whatsapp || contact.address) ? `
        <section class="legacy-secondary-card">
          <h4>Contact Details</h4>
          <div class="legacy-detail-lines">
            ${contact.email ? `<div><span>Email</span><a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a></div>` : ""}
            ${contact.phone ? `<div><span>Phone</span><a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a></div>` : ""}
            ${contact.whatsapp ? `<div><span>WhatsApp</span><a href="https://wa.me/${escapeHtml(String(contact.whatsapp).replace(/[^\d]/g, ""))}" target="_blank" rel="noreferrer">${escapeHtml(contact.whatsapp)}</a></div>` : ""}
            ${contact.address ? `<div><span>Address</span><strong>${escapeHtml(contact.address)}</strong></div>` : ""}
          </div>
        </section>
      ` : ""}
    </div>
  `;
}

function initProjectLocationFrame(project) {
  const pf2Frame = byId("pf2Frame");
  if (!pf2Frame) return;

  const defaultCoord = project.store?.coords || DEFAULT_COORDS;
  const defaultLat = defaultCoord[1];
  const defaultLng = defaultCoord[0];
  const defaultLabel = project.location || "Riyadh";
  const FIT_MAX_ZOOM = 16;
  const DEFAULT_RADIUS_KM = 10;
  const MIN_RADIUS_KM = 1;
  const MAX_RADIUS_KM = 50;
  const MAX_RESULTS = 20;
  const POI_CACHE_TTL_MS = 5 * 60 * 1000;
  const OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ];

  // Per-category Overpass tag selectors. Coordinates and the optional
  // brand filter are appended at query time so the same selector list
  // works against any active origin / brand combination.
  const categoryConfig = {
    schools: {
      label: "Schools",
      color: "#2563eb",
      placesType: "school",
      selectors: [
        'node["amenity"="school"]',
        'way["amenity"="school"]',
        'relation["amenity"="school"]',
      ],
    },
    mosques: {
      label: "Mosques",
      color: "#16a34a",
      placesType: "mosque",
      selectors: [
        'node["amenity"="place_of_worship"]["religion"="muslim"]',
        'way["amenity"="place_of_worship"]["religion"="muslim"]',
        'relation["amenity"="place_of_worship"]["religion"="muslim"]',
        'node["building"="mosque"]',
        'way["building"="mosque"]',
        'relation["building"="mosque"]',
      ],
    },
    restaurants: {
      label: "Restaurants",
      color: "#ea580c",
      placesType: "restaurant",
      selectors: [
        'node["amenity"="restaurant"]',
        'way["amenity"="restaurant"]',
        'relation["amenity"="restaurant"]',
        'node["amenity"="cafe"]',
        'way["amenity"="cafe"]',
        'relation["amenity"="cafe"]',
        'node["amenity"="fast_food"]',
        'way["amenity"="fast_food"]',
        'relation["amenity"="fast_food"]',
      ],
    },
    gyms: {
      label: "Gyms",
      color: "#dc2626",
      placesType: "gym",
      selectors: [
        'node["leisure"="fitness_centre"]',
        'way["leisure"="fitness_centre"]',
        'relation["leisure"="fitness_centre"]',
        'node["amenity"="gym"]',
        'way["amenity"="gym"]',
        'relation["amenity"="gym"]',
      ],
    },
  };

  // Common chains per category. Empty list = brand dropdown disabled
  // (the amenity itself isn't typically a branded chain). Filtering
  // happens via the OSM `brand` tag on the Overpass query and a
  // client-side fallback name match.
  const brandsByCategory = {
    schools: [],
    mosques: [],
    restaurants: [
      "McDonald's", "KFC", "Burger King", "Starbucks", "Subway",
      "Pizza Hut", "Domino's", "Hardee's", "Texas Chicken",
      "Tim Hortons", "AlBaik", "Herfy", "Kudu",
      "Nando's", "Shake Shack", "Costa Coffee", "Dunkin'",
    ],
    gyms: [
      "Fitness Time", "Gold's Gym", "Body Masters", "Armah Sports", "Wellfit",
    ],
  };

  const els = {
    categorySelect: byId("pf2CategorySelect"),
    brandSelect: byId("pf2BrandSelect"),
    modeSelect: byId("pf2ModeSelect"),
    radiusInput: byId("pf2RadiusInput"),
    map: byId("pf2Map"),
    status: byId("pf2Status"),
    summary: byId("pf2Summary"),
    count: byId("pf2Count"),
    list: byId("pf2ResultsList"),
    toggle: byId("pf2ResultsToggle"),
    locationSearch: byId("pf2LocationSearch"),
    locationLink: byId("pf2LocationLink"),
    locationLinkBtn: byId("pf2LocationLinkBtn"),
    locationReset: byId("pf2LocationReset"),
    locationLinkError: byId("pf2LocationLinkError"),
  };
  if (!els.map || !els.status || !els.summary || !els.list) return;

  function storageSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "default";
  }

  function getKnownWorkspaceFromText(value) {
    const match = String(value || "").match(/(?:^|[^a-z0-9])(opr|lia)(?:[^a-z0-9]|$)/i);
    return match ? match[1].toLowerCase() : "";
  }

  function getPf2StorageScope() {
    const params = new URLSearchParams(window.location.search);
    const explicit =
      pf2Frame.dataset.storageScope ||
      document.body.dataset.storageScope ||
      params.get("storageScope") ||
      params.get("workspace") ||
      params.get("app") ||
      params.get("context") ||
      "";
    if (explicit) return storageSlug(explicit);

    let referrerScope = "";
    try {
      if (document.referrer) {
        const referrer = new URL(document.referrer);
        referrerScope =
          getKnownWorkspaceFromText(`${referrer.hostname} ${referrer.pathname}`) ||
          `${referrer.hostname}${referrer.pathname}`;
      }
    } catch (_) { /* ignore malformed referrers */ }

    const locationScope =
      getKnownWorkspaceFromText(`${window.location.hostname} ${window.location.pathname}`) ||
      `${window.location.hostname}${window.location.pathname}`;
    const projectKey = project?.sourceId || project?.id || pageType || "nearby";

    return storageSlug([referrerScope, locationScope, projectKey].filter(Boolean).join("__"));
  }

  function clampRadiusKm(value) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return DEFAULT_RADIUS_KM;
    return Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.round(numeric)));
  }

  const state = {
    map: null,
    placesService: null,
    directionsService: null,
    distanceMatrixService: null,
    geocoder: null,
    placesAutocomplete: null,
    propertyMarker: null,
    poiMarkers: new Map(),
    poiCache: new Map(),
    mainRoutePolyline: null,
    altRoutePolylines: [],
    pois: [],
    loading: false,
    searchRequestId: 0,
    routeRequestId: 0,
    activeCategory: els.categorySelect?.value || "schools",
    activeMode: els.modeSelect?.value || "driving",
    activeBrand: "",
    activeRadiusKm: clampRadiusKm(els.radiusInput?.value || DEFAULT_RADIUS_KM),
    selectedPoiId: null,
    // When the AI runs a free-form Places search, this holds the query
    // string. Built-in category dropdown changes clear it back to null.
    aiQuery: null,
    // Active origin for all distance/route/AI calculations. Initialized
    // to the property's stored coords; the search bar, paste field, and
    // draggable pin can all replace it via setOrigin().
    origin: { lat: defaultLat, lng: defaultLng, label: defaultLabel },
    customDrawingMode: null,
    customDrawingPoints: [],
    customDrawingPreview: null,
    customDrawingListeners: [],
    mapDoubleClickZoomWasDisabled: false,
    userDrawingOverlays: new Map(),
    restoringSnapshot: false,
  };
  let radiusReloadTimer = null;
  const STORAGE_VERSION = 1;
  const MAX_SAVED_ITEMS = 80;
  const storageScope = getPf2StorageScope();
  const savedMapsStorageKey = `ats:pf2:${storageScope}:savedMaps`;
  const savedDrawingsStorageKey = `ats:pf2:${storageScope}:savedDrawings`;
  const customDrawingModes = new Set(["marker", "polyline", "polygon", "circle", "rectangle"]);

  const getOriginLatLng = () => ({ lat: state.origin.lat, lng: state.origin.lng });
  const getOriginCoord = () => [state.origin.lng, state.origin.lat];
  const getRadiusMeters = () => Math.round(state.activeRadiusKm * 1000);
  const isAtDefaultOrigin = () =>
    Math.abs(state.origin.lat - defaultLat) < 1e-6 &&
    Math.abs(state.origin.lng - defaultLng) < 1e-6;

  function escapeOverpass(value) {
    return String(value || "").replace(/[\\"]/g, "\\$&");
  }

  function buildOverpassQuery(categoryKey) {
    const cfg = categoryConfig[categoryKey];
    if (!cfg) return "";
    const around = `(around:${getRadiusMeters()},${state.origin.lat},${state.origin.lng})`;
    const brandFilter = state.activeBrand
      ? `["brand"~"${escapeOverpass(state.activeBrand)}",i]`
      : "";
    return cfg.selectors
      .map((sel) => `${sel}${brandFilter}${around};`)
      .join("");
  }

  function syncRadiusControl() {
    if (!els.radiusInput) return;
    els.radiusInput.value = String(state.activeRadiusKm);
  }

  function populateBrandOptions() {
    if (!els.brandSelect) return;
    const list = brandsByCategory[state.activeCategory] || [];
    const previous = state.activeBrand;
    const stillValid = list.includes(previous);
    els.brandSelect.innerHTML =
      `<option value="">All brands</option>` +
      list.map((b) => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
    if (stillValid) {
      els.brandSelect.value = previous;
    } else {
      state.activeBrand = "";
      els.brandSelect.value = "";
    }
    els.brandSelect.disabled = list.length === 0;
  }

  function setStatus(text, kind = "info") {
    els.status.textContent = text;
    els.status.setAttribute("data-pf2-kind", kind);
  }

  function setLoading(isLoading, text) {
    state.loading = Boolean(isLoading);
    pf2Frame.classList.toggle("pf2-isLoading", state.loading);
    els.status.setAttribute("aria-busy", String(state.loading));
    if (text) setStatus(text, state.loading ? "loading" : "info");
  }

  function setSummary(text) {
    els.summary.textContent = text || `Current location: ${state.origin.label}`;
  }

  function safeJsonParse(value, fallback) {
    try { return JSON.parse(value || ""); } catch (_) { return fallback; }
  }

  function makeSavedId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function formatSavedDate(timestamp) {
    const date = new Date(timestamp || Date.now());
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function readSavedCollection(key) {
    try {
      const parsed = safeJsonParse(window.localStorage.getItem(key), []);
      return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.state) : [];
    } catch (_) {
      return [];
    }
  }

  function writeSavedCollection(key, items) {
    try {
      const trimmed = (Array.isArray(items) ? items : []).slice(0, MAX_SAVED_ITEMS);
      window.localStorage.setItem(key, JSON.stringify(trimmed));
      return true;
    } catch (_) {
      setStatus("Could not save. Browser storage is unavailable.", "error");
      return false;
    }
  }

  const getSavedMaps = () => readSavedCollection(savedMapsStorageKey);
  const getSavedDrawings = () => readSavedCollection(savedDrawingsStorageKey);

  function ensureSelectOption(select, value, label = value) {
    if (!select || !value) return;
    const exists = Array.from(select.options || []).some((option) => option.value === value);
    if (!exists) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label || value;
      select.appendChild(option);
    }
    select.value = value;
  }

  function latLngLiteralFromValue(value) {
    if (!value) return null;
    const lat = typeof value.lat === "function" ? value.lat() : value.lat;
    const lng = typeof value.lng === "function" ? value.lng() : value.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  }

  function coordFromLatLng(value) {
    const literal = latLngLiteralFromValue(value);
    return literal ? [literal.lng, literal.lat] : null;
  }

  function pathToCoords(path) {
    if (!path) return [];
    const values = typeof path.getArray === "function" ? path.getArray() : path;
    return (Array.isArray(values) ? values : [])
      .map((item) => coordFromLatLng(item))
      .filter(Boolean);
  }

  function coordsToPath(coords) {
    return (Array.isArray(coords) ? coords : [])
      .map((coord) => Array.isArray(coord)
        ? { lat: Number(coord[1]), lng: Number(coord[0]) }
        : { lat: Number(coord?.lat), lng: Number(coord?.lng) })
      .filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lng));
  }

  function getMapCamera() {
    const center = state.map?.getCenter?.();
    return {
      center: latLngLiteralFromValue(center) || getOriginLatLng(),
      zoom: state.map?.getZoom?.() ?? 14,
      tilt: state.map?.getTilt?.() ?? 0,
      heading: state.map?.getHeading?.() ?? 0,
      mapTypeId: state.map?.getMapTypeId?.() || "roadmap",
    };
  }

  function applyMapCamera(camera) {
    if (!state.map || !camera) return;
    const center = latLngLiteralFromValue(camera.center);
    if (center) state.map.setCenter(center);
    if (Number.isFinite(camera.zoom)) state.map.setZoom(Number(camera.zoom));
    try {
      if (Number.isFinite(camera.tilt)) state.map.setTilt(Number(camera.tilt));
    } catch (_) { /* not supported on all map renderers */ }
    try {
      if (Number.isFinite(camera.heading)) state.map.setHeading(Number(camera.heading));
    } catch (_) { /* not supported on all map renderers */ }
    try {
      if (camera.mapTypeId) state.map.setMapTypeId(camera.mapTypeId);
    } catch (_) { /* ignore invalid map type ids */ }
  }

  function getRouteSnapshot() {
    return {
      main: state.mainRoutePolyline ? pathToCoords(state.mainRoutePolyline.getPath()) : [],
      alternates: state.altRoutePolylines.map((line) => pathToCoords(line.getPath())),
      summary: els.summary?.textContent || "",
    };
  }

  function restoreRouteSnapshot(routes) {
    clearRoutes();
    const color = state.aiQuery ? "#9B72F2" : (categoryConfig[state.activeCategory]?.color || "#0a7a73");
    const mainPath = coordsToPath(routes?.main);
    if (mainPath.length) {
      if (!state.mainRoutePolyline) {
        state.mainRoutePolyline = new google.maps.Polyline({
          map: state.map,
          path: mainPath,
          strokeColor: color,
          strokeOpacity: 0.9,
          strokeWeight: 6,
        });
      } else {
        state.mainRoutePolyline.setOptions({ strokeColor: color });
        state.mainRoutePolyline.setPath(mainPath);
        state.mainRoutePolyline.setMap(state.map);
      }
    }
    (routes?.alternates || []).forEach((coords) => {
      const path = coordsToPath(coords);
      if (!path.length) return;
      state.altRoutePolylines.push(new google.maps.Polyline({
        map: state.map,
        path,
        strokeColor: color,
        strokeOpacity: 0.35,
        strokeWeight: 4,
      }));
    });
    if (routes?.summary) setSummary(routes.summary);
  }

  function clonePoisForSave(pois) {
    return (pois || []).map((poi) => ({
      id: poi.id,
      name: poi.name,
      address: poi.address || "",
      coords: Array.isArray(poi.coords) ? [...poi.coords] : null,
      duration: poi.duration ?? null,
      distance: poi.distance ?? null,
      tags: poi.tags ? { ...poi.tags } : undefined,
    })).filter((poi) => Array.isArray(poi.coords));
  }

  function readOverlayOption(overlay, key, fallback) {
    try {
      const value = typeof overlay?.get === "function" ? overlay.get(key) : undefined;
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }

  function getDrawingStyle(type, overlay) {
    if (type === "marker") {
      return {
        title: readOverlayOption(overlay, "title", ""),
        label: readOverlayOption(overlay, "label", ""),
      };
    }
    return {
      strokeColor: readOverlayOption(overlay, "strokeColor", "#7c3aed"),
      strokeOpacity: readOverlayOption(overlay, "strokeOpacity", 0.85),
      strokeWeight: readOverlayOption(overlay, "strokeWeight", 3),
      fillColor: readOverlayOption(overlay, "fillColor", "#7c3aed"),
      fillOpacity: readOverlayOption(overlay, "fillOpacity", 0.18),
    };
  }

  function getOverlayDrawingType(type) {
    if (!type) return "";
    return String(type).replace(/^.*\./, "").toLowerCase();
  }

  function serializeDrawingOverlay(entry) {
    const type = getOverlayDrawingType(entry.type);
    const overlay = entry.overlay;
    if (!overlay) return null;
    let geometry = null;
    if (type === "marker") {
      geometry = { position: coordFromLatLng(overlay.getPosition?.() || overlay.position) };
    } else if (type === "polyline") {
      geometry = { path: pathToCoords(overlay.getPath?.()) };
    } else if (type === "polygon") {
      const paths = overlay.getPaths?.();
      geometry = {
        paths: paths?.getArray?.().map((path) => pathToCoords(path)).filter((path) => path.length) || [],
      };
    } else if (type === "circle") {
      geometry = {
        center: coordFromLatLng(overlay.getCenter?.()),
        radius: overlay.getRadius?.() || 0,
      };
    } else if (type === "rectangle") {
      const bounds = overlay.getBounds?.();
      const ne = bounds?.getNorthEast?.();
      const sw = bounds?.getSouthWest?.();
      geometry = { northEast: coordFromLatLng(ne), southWest: coordFromLatLng(sw) };
    }
    if (!geometry) return null;
    return {
      id: entry.id || makeSavedId("drawing"),
      type,
      name: entry.name || "",
      geometry,
      style: getDrawingStyle(type, overlay),
    };
  }

  function serializeUserDrawings() {
    return Array.from(state.userDrawingOverlays.values())
      .map((entry) => serializeDrawingOverlay(entry))
      .filter(Boolean);
  }

  function clearUserDrawings() {
    cancelCustomDrawing();
    state.userDrawingOverlays.forEach((entry) => {
      const overlay = entry?.overlay;
      if (typeof overlay?.setMap === "function") overlay.setMap(null);
      else if (overlay) overlay.map = null;
    });
    state.userDrawingOverlays.clear();
  }

  function createDrawingOverlayFromSnapshot(item) {
    if (!state.map || !window.google?.maps || !item) return null;
    const type = getOverlayDrawingType(item.type);
    const style = item.style || {};
    if (type === "marker") {
      const position = latLngLiteralFromValue({
        lat: item.geometry?.position?.[1],
        lng: item.geometry?.position?.[0],
      });
      if (!position) return null;
      return new google.maps.Marker({
        map: state.map,
        position,
        draggable: true,
        title: item.name || style.title || "Saved marker",
        label: style.label || undefined,
      });
    }
    const common = {
      map: state.map,
      editable: true,
      draggable: true,
      strokeColor: style.strokeColor || "#7c3aed",
      strokeOpacity: style.strokeOpacity ?? 0.85,
      strokeWeight: style.strokeWeight ?? 3,
      fillColor: style.fillColor || "#7c3aed",
      fillOpacity: style.fillOpacity ?? 0.18,
    };
    if (type === "polyline") {
      const path = coordsToPath(item.geometry?.path);
      return path.length ? new google.maps.Polyline({ ...common, path }) : null;
    }
    if (type === "polygon") {
      const paths = (item.geometry?.paths || []).map(coordsToPath).filter((path) => path.length);
      return paths.length ? new google.maps.Polygon({ ...common, paths }) : null;
    }
    if (type === "circle") {
      const center = latLngLiteralFromValue({
        lat: item.geometry?.center?.[1],
        lng: item.geometry?.center?.[0],
      });
      const radius = Number(item.geometry?.radius);
      return center && Number.isFinite(radius) ? new google.maps.Circle({ ...common, center, radius }) : null;
    }
    if (type === "rectangle") {
      const ne = item.geometry?.northEast;
      const sw = item.geometry?.southWest;
      if (!Array.isArray(ne) || !Array.isArray(sw)) return null;
      return new google.maps.Rectangle({
        ...common,
        bounds: {
          north: Number(ne[1]),
          east: Number(ne[0]),
          south: Number(sw[1]),
          west: Number(sw[0]),
        },
      });
    }
    return null;
  }

  function registerUserDrawing(type, overlay, data = {}) {
    if (!overlay) return null;
    const id = data.id || makeSavedId("drawing");
    const drawingType = getOverlayDrawingType(type);
    if (typeof overlay.setMap === "function") overlay.setMap(state.map);
    try {
      if (typeof overlay.setEditable === "function") overlay.setEditable(true);
      if (typeof overlay.setDraggable === "function") overlay.setDraggable(true);
    } catch (_) { /* some overlay types do not support these methods */ }
    const entry = {
      id,
      type: drawingType,
      name: data.name || "",
      overlay,
    };
    state.userDrawingOverlays.set(id, entry);
    return entry;
  }

  function restoreUserDrawings(drawings) {
    clearUserDrawings();
    (Array.isArray(drawings) ? drawings : []).forEach((item) => {
      const overlay = createDrawingOverlayFromSnapshot(item);
      if (overlay) registerUserDrawing(item.type, overlay, { id: item.id, name: item.name });
    });
  }

  function captureMapState() {
    return {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      scope: storageScope,
      camera: getMapCamera(),
      origin: { ...state.origin },
      filters: {
        category: state.activeCategory,
        categoryLabel: categoryConfig[state.activeCategory]?.label || state.activeCategory,
        brand: state.activeBrand,
        travelMode: state.activeMode,
        radiusKm: state.activeRadiusKm,
        aiQuery: state.aiQuery,
      },
      controls: {
        categoryValue: els.categorySelect?.value || state.activeCategory,
        brandValue: els.brandSelect?.value || state.activeBrand,
        modeValue: els.modeSelect?.value || state.activeMode,
        radiusValue: els.radiusInput?.value || String(state.activeRadiusKm),
        locationSearchValue: els.locationSearch?.value || "",
        locationLinkValue: els.locationLink?.value || "",
        resultsCollapsed: pf2Frame.classList.contains("pf2-resultsCollapsed"),
      },
      pois: clonePoisForSave(state.pois),
      selectedPoiId: state.selectedPoiId,
      routes: getRouteSnapshot(),
      drawings: serializeUserDrawings(),
    };
  }

  function syncSavedControls() {
    const maps = getSavedMaps();
    const drawings = getSavedDrawings();
    if (els.savedMapsSelect) {
      els.savedMapsSelect.innerHTML = maps.length
        ? maps.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || formatSavedDate(item.createdAt))}</option>`).join("")
        : '<option value="">No saved maps</option>';
      els.restoreMapBtn.disabled = maps.length === 0;
    }
    if (els.savedDrawingsSelect) {
      els.savedDrawingsSelect.innerHTML = drawings.length
        ? drawings.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name || formatSavedDate(item.createdAt))}</option>`).join("")
        : '<option value="">No saved drawings</option>';
      els.restoreDrawingBtn.disabled = drawings.length === 0;
    }
  }

  function ensureSaveRestoreUi() {
    if (pf2Frame.querySelector(".pf2-savebar")) {
      els.saveMapBtn = pf2Frame.querySelector("[data-pf2-save-map]");
      els.restoreMapBtn = pf2Frame.querySelector("[data-pf2-restore-map]");
      els.savedMapsSelect = pf2Frame.querySelector("[data-pf2-saved-maps]");
      els.saveDrawingBtn = pf2Frame.querySelector("[data-pf2-save-drawing]");
      els.restoreDrawingBtn = pf2Frame.querySelector("[data-pf2-restore-drawing]");
      els.savedDrawingsSelect = pf2Frame.querySelector("[data-pf2-saved-drawings]");
      els.drawToolButtons = Array.from(pf2Frame.querySelectorAll("[data-pf2-draw-mode]"));
      els.drawFinishBtn = pf2Frame.querySelector("[data-pf2-draw-finish]");
      syncSavedControls();
      return;
    }

    const bar = document.createElement("div");
    bar.className = "pf2-savebar";
    bar.innerHTML = `
      <div class="pf2-savebar-group">
        <button class="pf2-savebar-btn" type="button" data-pf2-save-map>Save Map</button>
        <label class="pf2-savebar-selectWrap">
          <span>Saved Maps</span>
          <select class="pf2-savebar-select" data-pf2-saved-maps aria-label="Saved maps"></select>
        </label>
        <button class="pf2-savebar-btn" type="button" data-pf2-restore-map>Restore</button>
      </div>
      <div class="pf2-savebar-group">
        <button class="pf2-savebar-btn" type="button" data-pf2-save-drawing>Save Drawing</button>
        <label class="pf2-savebar-selectWrap">
          <span>Saved Drawings</span>
          <select class="pf2-savebar-select" data-pf2-saved-drawings aria-label="Saved drawings"></select>
        </label>
        <button class="pf2-savebar-btn" type="button" data-pf2-restore-drawing>Restore</button>
      </div>
      <div class="pf2-savebar-group pf2-savebar-group--draw" aria-label="Drawing tools">
        <button class="pf2-savebar-btn" type="button" data-pf2-draw-mode="marker">Pin</button>
        <button class="pf2-savebar-btn" type="button" data-pf2-draw-mode="polyline">Line</button>
        <button class="pf2-savebar-btn" type="button" data-pf2-draw-mode="polygon">Polygon</button>
        <button class="pf2-savebar-btn" type="button" data-pf2-draw-mode="circle">Circle</button>
        <button class="pf2-savebar-btn" type="button" data-pf2-draw-mode="rectangle">Rect</button>
        <button class="pf2-savebar-btn" type="button" data-pf2-draw-finish disabled>Finish</button>
      </div>
    `;

    const tabs = byId("pf2Tabs");
    if (tabs?.parentNode === pf2Frame) tabs.insertAdjacentElement("afterend", bar);
    else pf2Frame.insertBefore(bar, pf2Frame.firstElementChild);

    els.saveMapBtn = bar.querySelector("[data-pf2-save-map]");
    els.restoreMapBtn = bar.querySelector("[data-pf2-restore-map]");
    els.savedMapsSelect = bar.querySelector("[data-pf2-saved-maps]");
    els.saveDrawingBtn = bar.querySelector("[data-pf2-save-drawing]");
    els.restoreDrawingBtn = bar.querySelector("[data-pf2-restore-drawing]");
    els.savedDrawingsSelect = bar.querySelector("[data-pf2-saved-drawings]");
    els.drawToolButtons = Array.from(bar.querySelectorAll("[data-pf2-draw-mode]"));
    els.drawFinishBtn = bar.querySelector("[data-pf2-draw-finish]");
    syncSavedControls();
  }

  function saveCurrentMapState() {
    if (!state.map) {
      setStatus("Map is still loading.", "loading");
      return;
    }
    const snapshot = captureMapState();
    const name = `Map - ${snapshot.origin.label || formatSavedDate(snapshot.savedAt)} - ${formatSavedDate(snapshot.savedAt)}`;
    const entry = { id: makeSavedId("map"), name, createdAt: snapshot.savedAt, state: snapshot };
    const next = [entry, ...getSavedMaps().filter((item) => item.id !== entry.id)];
    if (writeSavedCollection(savedMapsStorageKey, next)) {
      syncSavedControls();
      if (els.savedMapsSelect) els.savedMapsSelect.value = entry.id;
      setStatus("Map saved.", "success");
    }
  }

  function showDrawingNameDialog(defaultName = "Drawing") {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "pf2-drawing-name-dialog";
      dialog.innerHTML = `
        <form method="dialog" class="pf2-drawing-name-card">
          <h3>Save Drawing</h3>
          <label>
            <span>Drawing name</span>
            <input type="text" name="drawingName" maxlength="80" autocomplete="off" required />
          </label>
          <div class="pf2-drawing-name-actions">
            <button type="button" data-pf2-drawing-cancel>Cancel</button>
            <button type="submit" data-pf2-drawing-save>Save</button>
          </div>
        </form>
      `;
      const input = dialog.querySelector("input[name='drawingName']");
      const close = (value) => {
        try { dialog.close(); } catch (_) { /* noop */ }
        dialog.remove();
        resolve(value);
      };
      dialog.querySelector("[data-pf2-drawing-cancel]")?.addEventListener("click", () => close(null));
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close(null);
      });
      dialog.querySelector("form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = String(input?.value || "").trim();
        if (!name) return;
        close(name);
      });
      document.body.appendChild(dialog);
      input.value = defaultName;
      try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  }

  async function saveCurrentDrawingState() {
    if (!state.map) {
      setStatus("Map is still loading.", "loading");
      return;
    }
    const drawings = serializeUserDrawings();
    if (!drawings.length) {
      setStatus("Draw something on the map before saving a drawing.", "empty");
      return;
    }
    const name = await showDrawingNameDialog(`Drawing ${getSavedDrawings().length + 1}`);
    if (!name) return;
    const snapshot = captureMapState();
    snapshot.drawings = drawings;
    const entry = { id: makeSavedId("drawing-set"), name, createdAt: snapshot.savedAt, state: snapshot };
    const next = [entry, ...getSavedDrawings().filter((item) => item.id !== entry.id)];
    if (writeSavedCollection(savedDrawingsStorageKey, next)) {
      syncSavedControls();
      if (els.savedDrawingsSelect) els.savedDrawingsSelect.value = entry.id;
      setStatus(`Drawing "${name}" saved.`, "success");
    }
  }

  function restoreMapStateSnapshot(snapshot, label = "saved state") {
    if (!state.map || !snapshot) {
      setStatus("Map is still loading.", "loading");
      return;
    }
    state.restoringSnapshot = true;
    state.searchRequestId += 1;
    state.routeRequestId += 1;

    try {
      const filters = snapshot.filters || {};
      const controls = snapshot.controls || {};
      const origin = snapshot.origin || {};

      clearRoutes();
      clearPoiMarkers();

      state.activeCategory = filters.category || controls.categoryValue || state.activeCategory;
      ensureSelectOption(els.categorySelect, state.activeCategory, filters.categoryLabel || state.activeCategory);
      if (els.categorySelect) els.categorySelect.value = state.activeCategory;
      populateBrandOptions();

      state.activeBrand = filters.brand || controls.brandValue || "";
      ensureSelectOption(els.brandSelect, state.activeBrand, state.activeBrand);
      if (els.brandSelect) els.brandSelect.value = state.activeBrand;

      state.activeMode = filters.travelMode || controls.modeValue || state.activeMode;
      ensureSelectOption(els.modeSelect, state.activeMode, state.activeMode);
      if (els.modeSelect) els.modeSelect.value = state.activeMode;

      state.activeRadiusKm = clampRadiusKm(filters.radiusKm || controls.radiusValue || state.activeRadiusKm);
      syncRadiusControl();

      state.aiQuery = filters.aiQuery || null;
      state.selectedPoiId = snapshot.selectedPoiId || null;
      const originLat = Number(origin.lat);
      const originLng = Number(origin.lng);
      state.origin = {
        lat: Number.isFinite(originLat) ? originLat : defaultLat,
        lng: Number.isFinite(originLng) ? originLng : defaultLng,
        label: origin.label || defaultLabel,
      };

      if (state.propertyMarker) {
        if (typeof state.propertyMarker.setPosition === "function") {
          state.propertyMarker.setPosition(getOriginLatLng());
        } else {
          state.propertyMarker.position = getOriginLatLng();
        }
      }
      if (els.locationSearch) els.locationSearch.value = controls.locationSearchValue || state.origin.label;
      if (els.locationLink) els.locationLink.value = controls.locationLinkValue || "";
      if (els.locationReset) els.locationReset.style.display = isAtDefaultOrigin() ? "none" : "";

      state.pois = clonePoisForSave(snapshot.pois);
      renderPoiMarkers();
      renderResults();
      restoreRouteSnapshot(snapshot.routes);
      restoreUserDrawings(snapshot.drawings);
      pf2Frame.classList.toggle("pf2-resultsCollapsed", Boolean(controls.resultsCollapsed));
      els.toggle?.setAttribute("aria-expanded", String(!pf2Frame.classList.contains("pf2-resultsCollapsed")));
      applyMapCamera(snapshot.camera);

      setStatus(`Restored ${label}.`, "success");
      requestAnimationFrame(() => {
        if (state.map && window.google?.maps) google.maps.event.trigger(state.map, "resize");
        applyMapCamera(snapshot.camera);
      });
    } finally {
      state.restoringSnapshot = false;
    }
  }

  function restoreSelectedSavedMap() {
    const id = els.savedMapsSelect?.value;
    const entry = getSavedMaps().find((item) => item.id === id);
    if (entry) restoreMapStateSnapshot(entry.state, entry.name || "saved map");
  }

  function restoreSelectedSavedDrawing() {
    const id = els.savedDrawingsSelect?.value;
    const entry = getSavedDrawings().find((item) => item.id === id);
    if (entry) restoreMapStateSnapshot(entry.state, entry.name || "saved drawing");
  }

  function getDrawingOptions(overrides = {}) {
    return {
      map: state.map,
      editable: true,
      draggable: true,
      strokeColor: "#7c3aed",
      strokeOpacity: 0.85,
      strokeWeight: 3,
      fillColor: "#7c3aed",
      fillOpacity: 0.18,
      ...overrides,
    };
  }

  function getPreviewDrawingOptions(overrides = {}) {
    return getDrawingOptions({
      editable: false,
      draggable: false,
      clickable: false,
      strokeOpacity: 0.65,
      fillOpacity: 0.12,
      ...overrides,
    });
  }

  function distanceMetersBetween(a, b) {
    if (!a || !b) return 0;
    const first = new google.maps.LatLng(a.lat, a.lng);
    const second = new google.maps.LatLng(b.lat, b.lng);
    const spherical = google.maps.geometry?.spherical;
    if (typeof spherical?.computeDistanceBetween === "function") {
      return spherical.computeDistanceBetween(first, second);
    }
    const toRad = (value) => value * Math.PI / 180;
    const earthRadiusMeters = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function boundsFromTwoPoints(a, b) {
    if (!a || !b) return null;
    return {
      north: Math.max(a.lat, b.lat),
      east: Math.max(a.lng, b.lng),
      south: Math.min(a.lat, b.lat),
      west: Math.min(a.lng, b.lng),
    };
  }

  function clearCustomDrawingPreview() {
    const preview = state.customDrawingPreview;
    if (typeof preview?.setMap === "function") preview.setMap(null);
    state.customDrawingPreview = null;
  }

  function restoreMapDrawingInteraction() {
    if (!state.map) return;
    state.map.setOptions({
      disableDoubleClickZoom: state.mapDoubleClickZoomWasDisabled,
      draggableCursor: null,
    });
  }

  function updateDrawToolUi() {
    const activeMode = state.customDrawingMode;
    (els.drawToolButtons || []).forEach((button) => {
      const isActive = button.dataset.pf2DrawMode === activeMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    if (els.drawFinishBtn) {
      els.drawFinishBtn.disabled = !activeMode || activeMode === "marker";
    }
  }

  function cancelCustomDrawing(message) {
    const hadActiveDrawing = Boolean(state.customDrawingMode || state.customDrawingPreview);
    clearCustomDrawingPreview();
    state.customDrawingMode = null;
    state.customDrawingPoints = [];
    if (hadActiveDrawing) restoreMapDrawingInteraction();
    updateDrawToolUi();
    if (message && hadActiveDrawing) setStatus(message, "empty");
  }

  function setCustomDrawingMode(mode) {
    if (!state.map || !customDrawingModes.has(mode)) return;
    if (state.customDrawingMode === mode) {
      cancelCustomDrawing("Drawing canceled.");
      return;
    }
    const wasDrawing = Boolean(state.customDrawingMode);
    clearCustomDrawingPreview();
    state.customDrawingMode = mode;
    state.customDrawingPoints = [];
    if (!wasDrawing) {
      state.mapDoubleClickZoomWasDisabled = Boolean(state.map.get("disableDoubleClickZoom"));
    }
    state.map.setOptions({ disableDoubleClickZoom: true, draggableCursor: "crosshair" });
    updateDrawToolUi();
    const instructions = {
      marker: "Click the map to add a pin.",
      polyline: "Click points on the map to draw a line, then click Finish.",
      polygon: "Click points on the map to draw a polygon, then click Finish.",
      circle: "Click the center, then click the radius edge.",
      rectangle: "Click one corner, then click the opposite corner.",
    };
    setStatus(instructions[mode] || "Click the map to draw.", "loading");
  }

  function ensurePreviewOverlay(type, seedPoint) {
    if (state.customDrawingPreview) return state.customDrawingPreview;
    if (type === "polyline") {
      state.customDrawingPreview = new google.maps.Polyline(getPreviewDrawingOptions({ path: seedPoint ? [seedPoint] : [] }));
    } else if (type === "polygon") {
      state.customDrawingPreview = new google.maps.Polygon(getPreviewDrawingOptions({ paths: seedPoint ? [seedPoint] : [] }));
    } else if (type === "circle" && seedPoint) {
      state.customDrawingPreview = new google.maps.Circle(getPreviewDrawingOptions({ center: seedPoint, radius: 1 }));
    } else if (type === "rectangle" && seedPoint) {
      state.customDrawingPreview = new google.maps.Rectangle(getPreviewDrawingOptions({ bounds: boundsFromTwoPoints(seedPoint, seedPoint) }));
    }
    return state.customDrawingPreview;
  }

  function updateCustomDrawingPreview(pointerPoint = null) {
    const mode = state.customDrawingMode;
    const points = state.customDrawingPoints;
    if (!state.map || !mode || !points.length) return;
    if (mode === "polyline") {
      const path = pointerPoint ? [...points, pointerPoint] : points;
      ensurePreviewOverlay("polyline", points[0])?.setPath(path);
      return;
    }
    if (mode === "polygon") {
      const path = pointerPoint ? [...points, pointerPoint] : points;
      ensurePreviewOverlay("polygon", points[0])?.setPath(path);
      return;
    }
    if (mode === "circle") {
      const center = points[0];
      const edge = pointerPoint || points[1];
      if (!center || !edge) return;
      const preview = ensurePreviewOverlay("circle", center);
      preview?.setCenter(center);
      preview?.setRadius(Math.max(1, distanceMetersBetween(center, edge)));
      return;
    }
    if (mode === "rectangle") {
      const start = points[0];
      const end = pointerPoint || points[1];
      const bounds = boundsFromTwoPoints(start, end);
      if (!bounds) return;
      ensurePreviewOverlay("rectangle", start)?.setBounds(bounds);
    }
  }

  function finishCustomDrawing() {
    if (!state.map || !state.customDrawingMode) return;
    const mode = state.customDrawingMode;
    const points = state.customDrawingPoints.slice();
    let overlay = null;

    if (mode === "polyline" && points.length >= 2) {
      overlay = new google.maps.Polyline(getDrawingOptions({ path: points }));
    } else if (mode === "polygon" && points.length >= 3) {
      overlay = new google.maps.Polygon(getDrawingOptions({ paths: points }));
    } else if (mode === "circle") {
      const center = points[0];
      const radius = Number(state.customDrawingPreview?.getRadius?.()) ||
        (points[1] ? distanceMetersBetween(center, points[1]) : 0);
      if (center && radius > 0) overlay = new google.maps.Circle(getDrawingOptions({ center, radius }));
    } else if (mode === "rectangle") {
      const bounds = state.customDrawingPreview?.getBounds?.() ||
        (points[0] && points[1] ? boundsFromTwoPoints(points[0], points[1]) : null);
      if (bounds) overlay = new google.maps.Rectangle(getDrawingOptions({ bounds }));
    }

    if (!overlay) {
      setStatus("Add more points before finishing this drawing.", "empty");
      return;
    }

    registerUserDrawing(mode, overlay);
    cancelCustomDrawing();
    setStatus("Drawing added. Use Save Drawing to name and store it.", "success");
  }

  function handleCustomDrawingClick(event) {
    if (!state.customDrawingMode) return;
    event.domEvent?.preventDefault?.();
    event.domEvent?.stopPropagation?.();
    const point = latLngLiteralFromValue(event.latLng);
    if (!point) return;
    const mode = state.customDrawingMode;

    if (mode === "marker") {
      const marker = new google.maps.Marker({
        map: state.map,
        position: point,
        draggable: true,
        title: "Saved marker",
      });
      registerUserDrawing("marker", marker);
      cancelCustomDrawing();
      setStatus("Pin added. Use Save Drawing to name and store it.", "success");
      return;
    }

    state.customDrawingPoints.push(point);
    updateCustomDrawingPreview();
    if ((mode === "circle" || mode === "rectangle") && state.customDrawingPoints.length >= 2) {
      finishCustomDrawing();
      return;
    }
    const pointCount = state.customDrawingPoints.length;
    setStatus(`${pointCount} point${pointCount === 1 ? "" : "s"} added. Click Finish when the drawing is complete.`, "loading");
  }

  function handleCustomDrawingMouseMove(event) {
    if (!state.customDrawingMode || !state.customDrawingPoints.length) return;
    const point = latLngLiteralFromValue(event.latLng);
    if (!point) return;
    updateCustomDrawingPreview(point);
  }

  function initDrawingTools() {
    if (!state.map || state.customDrawingListeners.length || !window.google?.maps) return;
    state.customDrawingListeners = [
      google.maps.event.addListener(state.map, "click", handleCustomDrawingClick),
      google.maps.event.addListener(state.map, "mousemove", handleCustomDrawingMouseMove),
      google.maps.event.addListener(state.map, "dblclick", (event) => {
        if (!state.customDrawingMode || state.customDrawingMode === "marker") return;
        event.domEvent?.preventDefault?.();
        event.domEvent?.stopPropagation?.();
        finishCustomDrawing();
      }),
    ];
    updateDrawToolUi();
  }

  function formatDuration(seconds) {
    if (typeof seconds !== "number") return "Time unavailable";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  function formatDistance(meters) {
    if (typeof meters !== "number") return "Distance unavailable";
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  function buildMarkerElement(color, label, variant) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = `pf2-marker pf2-marker--${variant}`;
    element.style.setProperty("--pf2-marker-color", color);
    element.innerHTML = `<span class="pf2-marker__dot"></span>${label ? `<span class="pf2-marker__label">${escapeHtml(label)}</span>` : ""}`;
    return element;
  }

  function fitToCoordinates(coordsList) {
    if (!state.map || !coordsList.length) return;
    const bounds = new google.maps.LatLngBounds();
    let extended = false;
    coordsList.forEach((coord) => {
      const ll = latLngOf(coord);
      if (!ll) return;
      bounds.extend(ll);
      extended = true;
    });
    if (!extended) return;
    state.map.fitBounds(bounds, 56);
    google.maps.event.addListenerOnce(state.map, "idle", () => {
      if (state.map.getZoom() > FIT_MAX_ZOOM) state.map.setZoom(FIT_MAX_ZOOM);
    });
  }

  function clearPoiMarkers() {
    state.poiMarkers.forEach((marker) => {
      if (typeof marker?.setMap === "function") marker.setMap(null);
      else if (marker) marker.map = null;
    });
    state.poiMarkers.clear();
  }

  function clearAltRoutes() {
    state.altRoutePolylines.forEach((line) => line.setMap(null));
    state.altRoutePolylines = [];
  }

  function clearRoutes() {
    if (state.mainRoutePolyline) state.mainRoutePolyline.setPath([]);
    clearAltRoutes();
    setSummary("");
  }

  function drawRoutes(routes, color) {
    if (!state.map || !routes.length) return;
    const mainPath = routes[0].overview_path || [];
    if (!state.mainRoutePolyline) {
      state.mainRoutePolyline = new google.maps.Polyline({
        map: state.map,
        path: mainPath,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 6,
      });
    } else {
      state.mainRoutePolyline.setOptions({ strokeColor: color });
      state.mainRoutePolyline.setPath(mainPath);
      state.mainRoutePolyline.setMap(state.map);
    }
    clearAltRoutes();
    routes.slice(1).forEach((route) => {
      const line = new google.maps.Polyline({
        map: state.map,
        path: route.overview_path || [],
        strokeColor: color,
        strokeOpacity: 0.35,
        strokeWeight: 4,
      });
      state.altRoutePolylines.push(line);
    });
  }

  function renderResults() {
    if (els.count) els.count.textContent = String(state.pois.length);
    if (state.loading && !state.pois.length && els.status.getAttribute("data-pf2-kind") === "loading") {
      els.list.innerHTML = '<div class="pf2-empty">Loading nearby places...</div>';
      return;
    }
    if (!state.pois.length) {
      els.list.innerHTML = '<div class="pf2-empty">No results found.</div>';
      return;
    }
    els.list.innerHTML = state.pois.map((poi) => `
      <button class="pf2-result${poi.id === state.selectedPoiId ? " is-active" : ""}" type="button" data-pf2-poi-id="${escapeHtml(poi.id)}">
        <div class="pf2-resultRow">
          <div class="pf2-resultCopy">
            <div class="pf2-resultTitle">${escapeHtml(poi.name)}</div>
            <div class="pf2-resultAddress">${escapeHtml(poi.address || "Address unavailable")}</div>
          </div>
          <div class="pf2-resultMeta">
            <span class="pf2-resultDuration">${escapeHtml(formatDuration(poi.duration))}</span>
            <span class="pf2-resultDistance">${escapeHtml(formatDistance(poi.distance))}</span>
          </div>
        </div>
      </button>
    `).join("");
  }

  function renderPoiMarkers() {
    if (!state.map || !window.google?.maps) return;
    clearPoiMarkers();
    // AI free-form searches use the Gemini purple to distinguish them
    // from the built-in category colors.
    const color = state.aiQuery
      ? "#9B72F2"
      : (categoryConfig[state.activeCategory]?.color || "#0a7a73");
    const AdvancedMarker = google.maps.marker?.AdvancedMarkerElement;
    state.pois.forEach((poi) => {
      let marker;
      if (AdvancedMarker) {
        const markerEl = buildMarkerElement(color, "", "poi");
        if (poi.id === state.selectedPoiId) markerEl.classList.add("is-active");
        markerEl.addEventListener("click", () => selectPoi(poi.id));
        marker = new AdvancedMarker({
          map: state.map,
          position: { lat: poi.coords[1], lng: poi.coords[0] },
          content: markerEl,
        });
      } else {
        marker = new google.maps.Marker({
          map: state.map,
          position: { lat: poi.coords[1], lng: poi.coords[0] },
          title: poi.name,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: poi.id === state.selectedPoiId ? 8 : 6,
            fillColor: color,
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2,
          },
        });
        marker.addListener("click", () => selectPoi(poi.id));
      }
      state.poiMarkers.set(poi.id, marker);
    });
  }

  async function applyMatrix(pois) {
    if (!pois.length || !state.distanceMatrixService) return pois;
    const travelMode = googleTravelMode(state.activeMode);
    if (!travelMode) return pois;
    const destinations = pois.map((poi) => ({ lat: poi.coords[1], lng: poi.coords[0] }));
    try {
      const response = await new Promise((resolve, reject) => {
        state.distanceMatrixService.getDistanceMatrix({
          origins: [getOriginLatLng()],
          destinations,
          travelMode,
        }, (res, status) => {
          if (status === "OK") resolve(res);
          else reject(new Error("Matrix " + status));
        });
      });
      const elements = response.rows?.[0]?.elements || [];
      return pois
        .map((poi, index) => {
          const cell = elements[index] || {};
          return {
            ...poi,
            duration: cell.status === "OK" && cell.duration ? cell.duration.value : null,
            distance: cell.status === "OK" && cell.distance ? cell.distance.value : null,
          };
        })
        .sort((a, b) => {
          if (a.duration == null && b.duration == null) return 0;
          if (a.duration == null) return 1;
          if (b.duration == null) return -1;
          return a.duration - b.duration;
        });
    } catch (_) {
      return pois;
    }
  }

  function clonePois(pois) {
    return (pois || []).map((poi) => ({
      ...poi,
      coords: [...poi.coords],
      tags: poi.tags ? { ...poi.tags } : undefined,
      duration: null,
      distance: null,
    }));
  }

  function dedupePois(pois) {
    const seen = new Set();
    return (pois || []).filter((poi) => {
      if (!poi?.coords) return false;
      const nameKey = String(poi.name || "").trim().toLowerCase();
      const coordKey = `${poi.coords[0].toFixed(4)},${poi.coords[1].toFixed(4)}`;
      const key = `${nameKey}|${coordKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, MAX_RESULTS);
  }

  function getPoiCacheKey(categoryKey) {
    return [
      categoryKey,
      state.activeBrand.trim().toLowerCase(),
      state.activeRadiusKm,
      state.origin.lat.toFixed(4),
      state.origin.lng.toFixed(4),
    ].join("|");
  }

  function readPoiCache(cacheKey, allowStale = false) {
    const cached = state.poiCache.get(cacheKey);
    if (!cached) return null;
    if (!allowStale && Date.now() - cached.timestamp > POI_CACHE_TTL_MS) return null;
    return clonePois(cached.pois);
  }

  function writePoiCache(cacheKey, pois) {
    state.poiCache.set(cacheKey, {
      timestamp: Date.now(),
      pois: clonePois(pois),
    });
  }

  function normalizeOverpassElements(elements, categoryKey) {
    const brandLower = state.activeBrand ? state.activeBrand.toLowerCase() : "";
    let pois = (elements || [])
      .map((element, index) => {
        const tags = element.tags || {};
        const coords = typeof element.lon === "number" && typeof element.lat === "number"
          ? [element.lon, element.lat]
          : (element.center && typeof element.center.lon === "number" && typeof element.center.lat === "number"
            ? [element.center.lon, element.center.lat]
            : null);
        if (!coords) return null;
        return {
          id: `${categoryKey}-${element.type}-${element.id || index}`,
          name: tags["name:en"] || tags.name || `${categoryConfig[categoryKey].label.slice(0, -1)} ${index + 1}`,
          address: [tags["addr:street"], tags["addr:city"], tags["addr:suburb"]].filter(Boolean).join(", "),
          coords,
          duration: null,
          distance: null,
          tags,
        };
      })
      .filter(Boolean);

    if (brandLower && pois.length) {
      pois = pois.filter((poi) => {
        const tags = poi.tags || {};
        const fields = [tags.brand, tags["brand:en"], tags.operator, poi.name];
        return fields.some((v) => v && String(v).toLowerCase().includes(brandLower));
      });
    }

    return dedupePois(pois);
  }

  function normalizePlacesResult(place, categoryKey, index) {
    const loc = place.geometry?.location;
    if (!loc) return null;
    const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
    const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      id: place.place_id || `places-${categoryKey}-${index}`,
      name: place.name || `${categoryConfig[categoryKey].label.slice(0, -1)} ${index + 1}`,
      address: place.vicinity || place.formatted_address || "",
      coords: [lng, lat],
      duration: null,
      distance: null,
    };
  }

  async function fetchOverpassPois(categoryKey) {
    const query = buildOverpassQuery(categoryKey);
    if (!query) return [];
    let firstError = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 14000);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body: new URLSearchParams({
            data: `[out:json][timeout:25];(${query});out center;`,
          }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error("POI API error");
        return normalizeOverpassElements(data.elements, categoryKey);
      } catch (err) {
        firstError ||= err;
      } finally {
        window.clearTimeout(timeout);
      }
    }
    throw firstError || new Error("POI API error");
  }

  async function fetchPlacesPois(categoryKey) {
    const cfg = categoryConfig[categoryKey];
    if (!cfg?.placesType || !state.placesService || !window.google?.maps?.places) return [];
    const Status = google.maps.places.PlacesServiceStatus;
    const request = {
      location: getOriginLatLng(),
      radius: Math.min(getRadiusMeters(), 50000),
      type: cfg.placesType,
    };
    if (state.activeBrand) request.keyword = state.activeBrand;
    const results = await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Places timeout")), 12000);
      state.placesService.nearbySearch(request, (items, status) => {
        window.clearTimeout(timeout);
        if (status === Status.OK || status === Status.ZERO_RESULTS) resolve(items || []);
        else reject(new Error("Places " + status));
      });
    });
    return dedupePois(results
      .map((place, index) => normalizePlacesResult(place, categoryKey, index))
      .filter(Boolean));
  }

  async function fetchPois(categoryKey) {
    const cacheKey = getPoiCacheKey(categoryKey);
    const cached = readPoiCache(cacheKey);
    if (cached) return applyMatrix(cached);

    let rawPois = [];
    let providerError = null;
    try {
      rawPois = await fetchOverpassPois(categoryKey);
    } catch (err) {
      providerError = err;
    }

    if (!rawPois.length) {
      try {
        rawPois = await fetchPlacesPois(categoryKey);
      } catch (err) {
        providerError ||= err;
      }
    }

    if (rawPois.length) {
      writePoiCache(cacheKey, rawPois);
      return applyMatrix(rawPois);
    }

    const stale = readPoiCache(cacheKey, true);
    if (stale) return applyMatrix(stale);
    if (providerError) throw providerError;
    return [];
  }

  async function loadCategory(categoryKey) {
    if (!categoryConfig[categoryKey] || !state.map) return;
    const requestId = ++state.searchRequestId;
    state.routeRequestId += 1;
    state.activeCategory = categoryKey;
    state.aiQuery = null;
    state.selectedPoiId = null;
    clearRoutes();
    clearPoiMarkers();
    state.pois = [];
    setLoading(true, `Loading ${categoryConfig[categoryKey].label.toLowerCase()} within ${state.activeRadiusKm} km...`);
    renderResults();
    try {
      const pois = await fetchPois(categoryKey);
      if (requestId !== state.searchRequestId) return;
      state.pois = pois;
      if (!state.pois.length) {
        setStatus("No results found", "empty");
        renderResults();
        return;
      }
      renderPoiMarkers();
      renderResults();
      fitToCoordinates([getOriginCoord(), ...state.pois.map((poi) => poi.coords)]);
      const brandSuffix = state.activeBrand ? ` matching "${state.activeBrand}"` : "";
      setStatus(`${state.pois.length} ${categoryConfig[categoryKey].label.toLowerCase()}${brandSuffix} within ${state.activeRadiusKm} km of ${state.origin.label}`, "success");
    } catch (_) {
      if (requestId !== state.searchRequestId) return;
      setStatus("Results unavailable. Try again.", "error");
      renderResults();
    } finally {
      if (requestId === state.searchRequestId) setLoading(false);
    }
  }

  // Free-form Google Places text search driven by the AI assistant. Lets
  // the user ask for anything ("sushi", "hospital", "mall", "park", …) —
  // not just the 4 built-in categories. Results are normalized to the same
  // POI shape so the rest of the UI (markers, list, focus_poi, set_mode)
  // works unchanged.
  async function aiSearch(query) {
    const q = String(query || "").trim();
    if (!q || !state.map || !state.placesService) return;
    const requestId = ++state.searchRequestId;
    state.routeRequestId += 1;
    state.aiQuery = q;
    state.selectedPoiId = null;
    clearRoutes();
    clearPoiMarkers();
    state.pois = [];
    setLoading(true, `Searching for "${q}" within ${state.activeRadiusKm} km...`);
    renderResults();
    try {
      const results = await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Places timeout")), 12000);
        state.placesService.textSearch({
          query: q,
          location: getOriginLatLng(),
          radius: Math.min(getRadiusMeters(), 50000),
        }, (items, status) => {
          window.clearTimeout(timeout);
          const Status = google.maps.places.PlacesServiceStatus;
          if (status === Status.OK || status === Status.ZERO_RESULTS) resolve(items || []);
          else reject(new Error("Places " + status));
        });
      });
      const pois = results.slice(0, 20).map((place, index) => {
        const loc = place.geometry?.location;
        if (!loc) return null;
        const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
        const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: place.place_id || `ai-${q}-${index}`,
          name: place.name || `Result ${index + 1}`,
          address: place.formatted_address || place.vicinity || "",
          coords: [lng, lat],
          duration: null,
          distance: null,
        };
      }).filter(Boolean);
      if (requestId !== state.searchRequestId) return;
      if (!pois.length) {
        setStatus(`No results found for "${q}"`, "empty");
        renderResults();
        return;
      }
      const timed = await applyMatrix(pois);
      if (requestId !== state.searchRequestId) return;
      state.pois = timed;
      renderPoiMarkers();
      renderResults();
      fitToCoordinates([getOriginCoord(), ...state.pois.map((p) => p.coords)]);
      setStatus(`${state.pois.length} result${state.pois.length === 1 ? "" : "s"} for "${q}" within ${state.activeRadiusKm} km`, "success");
    } catch (err) {
      if (requestId !== state.searchRequestId) return;
      setStatus("Search failed. Try again.", "error");
      renderResults();
    } finally {
      if (requestId === state.searchRequestId) setLoading(false);
    }
  }

  async function selectPoi(poiId) {
    const poi = state.pois.find((item) => item.id === poiId);
    if (!poi || !state.directionsService) return;
    const requestId = ++state.routeRequestId;
    state.selectedPoiId = poiId;
    renderPoiMarkers();
    renderResults();
    const travelMode = googleTravelMode(state.activeMode);
    if (!travelMode) {
      setSummary(`${poi.name} • ${formatDistance(poi.distance)}`);
      return;
    }
    setLoading(true, `Routing to ${poi.name}...`);
    try {
      const response = await new Promise((resolve, reject) => {
        state.directionsService.route({
          origin: getOriginLatLng(),
          destination: { lat: poi.coords[1], lng: poi.coords[0] },
          travelMode,
          provideRouteAlternatives: true,
        }, (res, status) => {
          if (status === "OK") resolve(res);
          else reject(new Error("Directions " + status));
        });
      });
      if (requestId !== state.routeRequestId) return;
      const routes = (response.routes || []).map((route) => {
        const leg = route.legs?.[0] || {};
        return {
          overview_path: route.overview_path || [],
          duration: leg.duration?.value ?? null,
          distance: leg.distance?.value ?? null,
        };
      });
      if (!routes.length) {
        setStatus("No route found", "empty");
        clearRoutes();
        return;
      }
      drawRoutes(routes, categoryConfig[state.activeCategory].color);
      setSummary(`${formatDuration(routes[0].duration)} • ${formatDistance(routes[0].distance)} • ${state.activeMode}`);
      fitToCoordinates(routes[0].overview_path);
      setStatus(`${poi.name} selected`, "success");
    } catch (_) {
      if (requestId !== state.routeRequestId) return;
      setStatus("API error", "error");
      clearRoutes();
    } finally {
      if (requestId === state.routeRequestId) setLoading(false);
    }
  }

  async function setMode(mode) {
    if (!googleTravelMode(mode) || mode === state.activeMode) return;
    state.activeMode = mode;
    clearRoutes();
    if (!state.pois.length) {
      if (state.aiQuery) await aiSearch(state.aiQuery);
      else await loadCategory(state.activeCategory);
      return;
    }
    if (state.aiQuery) {
      // AI free-form search is active — re-run the matrix on the same
      // POIs instead of reloading a built-in category.
      const requestId = ++state.searchRequestId;
      setLoading(true, `Updating ${mode} times...`);
      const refreshed = await applyMatrix(state.pois);
      if (requestId !== state.searchRequestId) return;
      state.pois = refreshed;
      renderPoiMarkers();
      renderResults();
      setStatus(`Updated for ${mode}`, "success");
      setLoading(false);
      return;
    }
    await loadCategory(state.activeCategory);
  }

  // ── Origin updates ─────────────────────────────────────────────
  // Repoints every downstream calculation (matrix, directions, AI
  // context, POI fetch) at a new lat/lng. Called by the search bar,
  // paste field, draggable marker, and the reset button.
  async function setOrigin(lat, lng, label, opts = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    state.origin = {
      lat,
      lng,
      label: label || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    };
    if (state.map) {
      state.map.panTo(getOriginLatLng());
    }
    if (state.propertyMarker) {
      if (typeof state.propertyMarker.setPosition === "function") {
        state.propertyMarker.setPosition(getOriginLatLng());
      } else {
        state.propertyMarker.position = getOriginLatLng();
      }
    }
    if (els.locationReset) {
      els.locationReset.style.display = isAtDefaultOrigin() ? "none" : "";
    }
    if (els.locationSearch && opts.skipSearchSync !== true) {
      els.locationSearch.value = state.origin.label;
    }
    setSummary(`Current location: ${state.origin.label}`);
    if (opts.silentReload === true) return;
    if (state.aiQuery) {
      await aiSearch(state.aiQuery);
    } else {
      await loadCategory(state.activeCategory);
    }
  }

  function applyRadiusFromInput() {
    if (!els.radiusInput) return;
    const rawValue = String(els.radiusInput.value || "").trim();
    const nextRadius = clampRadiusKm(rawValue || DEFAULT_RADIUS_KM);
    if (nextRadius !== state.activeRadiusKm) {
      state.activeRadiusKm = nextRadius;
      syncRadiusControl();
      clearRoutes();
      if (state.aiQuery) {
        aiSearch(state.aiQuery);
      } else {
        loadCategory(state.activeCategory);
      }
    } else {
      syncRadiusControl();
    }
  }

  function scheduleRadiusReload() {
    if (!els.radiusInput || !String(els.radiusInput.value || "").trim()) return;
    window.clearTimeout(radiusReloadTimer);
    radiusReloadTimer = window.setTimeout(applyRadiusFromInput, 450);
  }

  function setLocationLinkError(text) {
    if (!els.locationLinkError) return;
    els.locationLinkError.textContent = text || "";
    els.locationLinkError.style.display = text ? "" : "none";
  }

  function parseLocationLink(input) {
    const trimmed = String(input || "").trim();
    if (!trimmed) return null;
    const coordPair = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (coordPair) {
      const lat = Number(coordPair[1]);
      const lng = Number(coordPair[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
      }
    }
    const at = trimmed.match(/[@!]([\d.\-]+),([\d.\-]+)/);
    if (at) {
      const lat = Number(at[1]);
      const lng = Number(at[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng, label: trimmed };
      }
    }
    try {
      const url = new URL(trimmed);
      for (const key of ["q", "ll", "query", "destination"]) {
        const value = url.searchParams.get(key);
        if (!value) continue;
        const m = value.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (m) {
          const lat = Number(m[1]);
          const lng = Number(m[2]);
          if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, label: trimmed };
        }
      }
    } catch (_) { /* not a URL */ }
    return null;
  }

  async function geocodeAddress(input) {
    if (!state.geocoder) return null;
    return new Promise((resolve) => {
      state.geocoder.geocode({ address: input }, (results, status) => {
        if (status === "OK" && results && results[0]?.geometry?.location) {
          const loc = results[0].geometry.location;
          const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
          const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
          resolve({ lat, lng, label: results[0].formatted_address || input });
        } else {
          resolve(null);
        }
      });
    });
  }

  async function handleLocationLinkSubmit() {
    if (!els.locationLink) return;
    const value = els.locationLink.value.trim();
    if (!value) return;
    setLocationLinkError("");
    const parsed = parseLocationLink(value);
    if (parsed) {
      await setOrigin(parsed.lat, parsed.lng, parsed.label);
      els.locationLink.value = "";
      return;
    }
    if (/maps\.app\.goo\.gl/i.test(value)) {
      setLocationLinkError("Short Google Maps links can't be expanded — paste the full link or coordinates instead.");
      return;
    }
    const geo = await geocodeAddress(value);
    if (geo) {
      await setOrigin(geo.lat, geo.lng, geo.label);
      els.locationLink.value = "";
      return;
    }
    setLocationLinkError("Couldn't find that location. Try paste-coordinates or a full Google Maps link.");
  }

  function handleResetLocation() {
    setOrigin(defaultLat, defaultLng, defaultLabel);
  }

  function handleFrameClick(event) {
    const drawModeButton = event.target.closest("[data-pf2-draw-mode]");
    if (drawModeButton) {
      setCustomDrawingMode(drawModeButton.dataset.pf2DrawMode);
      return;
    }
    if (event.target.closest("[data-pf2-draw-finish]")) {
      finishCustomDrawing();
      return;
    }
    if (event.target.closest("[data-pf2-save-map]")) {
      saveCurrentMapState();
      return;
    }
    if (event.target.closest("[data-pf2-restore-map]")) {
      restoreSelectedSavedMap();
      return;
    }
    if (event.target.closest("[data-pf2-save-drawing]")) {
      saveCurrentDrawingState();
      return;
    }
    if (event.target.closest("[data-pf2-restore-drawing]")) {
      restoreSelectedSavedDrawing();
      return;
    }
    if (event.target.closest("#pf2LocationLinkBtn")) {
      handleLocationLinkSubmit();
      return;
    }
    if (event.target.closest("#pf2LocationReset")) {
      handleResetLocation();
      return;
    }
    const row = event.target.closest("[data-pf2-poi-id]");
    if (row) {
      selectPoi(row.getAttribute("data-pf2-poi-id"));
      return;
    }
    if (event.target.closest("#pf2ResultsToggle")) {
      pf2Frame.classList.toggle("pf2-resultsCollapsed");
      els.toggle?.setAttribute("aria-expanded", String(!pf2Frame.classList.contains("pf2-resultsCollapsed")));
    }
  }

  function handleFrameChange(event) {
    if (event.target === els.categorySelect) {
      state.activeCategory = event.target.value;
      populateBrandOptions();
      loadCategory(state.activeCategory);
      return;
    }
    if (event.target === els.brandSelect) {
      state.activeBrand = event.target.value || "";
      if (state.aiQuery) {
        aiSearch(state.aiQuery);
      } else {
        loadCategory(state.activeCategory);
      }
      return;
    }
    if (event.target === els.modeSelect) {
      setMode(event.target.value);
      return;
    }
    if (event.target === els.radiusInput) {
      applyRadiusFromInput();
    }
  }

  function handleFrameInput(event) {
    if (event.target === els.radiusInput) {
      scheduleRadiusReload();
    }
  }

  function handleFrameKeydown(event) {
    if (event.key === "Escape" && state.customDrawingMode) {
      event.preventDefault();
      cancelCustomDrawing("Drawing canceled.");
      return;
    }
    if (event.key !== "Enter") return;
    if (event.target === els.locationLink) {
      event.preventDefault();
      handleLocationLinkSubmit();
    }
  }

  els.status.setAttribute("role", "status");
  els.status.setAttribute("aria-live", "polite");
  ensureSaveRestoreUi();
  syncRadiusControl();
  populateBrandOptions();

  loadGoogleMaps().then(() => {
    if (state.map) return;
    state.map = new google.maps.Map(els.map, {
      mapId: window.ATS_ENV?.GOOGLE_MAP_ID || undefined,
      center: getOriginLatLng(),
      zoom: 14,
      tilt: 52,
      heading: ((-18 % 360) + 360) % 360,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: true,
      scaleControl: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      keyboardShortcuts: false,
    });
    state.placesService = new google.maps.places.PlacesService(state.map);
    state.directionsService = new google.maps.DirectionsService();
    state.distanceMatrixService = new google.maps.DistanceMatrixService();
    state.geocoder = new google.maps.Geocoder();
    initDrawingTools();
    const AdvancedMarker = google.maps.marker?.AdvancedMarkerElement;
    const handleOriginMarkerDrag = (event) => {
      const pos = event?.latLng || state.propertyMarker?.position || state.propertyMarker?.getPosition?.();
      if (!pos) return;
      const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
      const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setOrigin(lat, lng, `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    };
    if (AdvancedMarker) {
      const propertyMarkerEl = buildMarkerElement("#7c3aed", "Drag", "property");
      state.propertyMarker = new AdvancedMarker({
        map: state.map,
        position: getOriginLatLng(),
        content: propertyMarkerEl,
        gmpDraggable: true,
        title: "Drag to set the active location",
      });
      state.propertyMarker.addListener("dragend", handleOriginMarkerDrag);
    } else {
      state.propertyMarker = new google.maps.Marker({
        map: state.map,
        position: getOriginLatLng(),
        draggable: true,
        title: "Drag to set the active location",
        label: "Drag",
      });
      state.propertyMarker.addListener("dragend", handleOriginMarkerDrag);
    }

    // Wire the "search this map" autocomplete field above the map.
    if (els.locationSearch && google.maps.places?.Autocomplete) {
      els.locationSearch.value = state.origin.label;
      state.placesAutocomplete = new google.maps.places.Autocomplete(els.locationSearch, {
        fields: ["geometry", "formatted_address", "name"],
      });
      state.placesAutocomplete.bindTo("bounds", state.map);
      state.placesAutocomplete.addListener("place_changed", () => {
        const place = state.placesAutocomplete.getPlace();
        const loc = place?.geometry?.location;
        if (!loc) return;
        const lat = typeof loc.lat === "function" ? loc.lat() : loc.lat;
        const lng = typeof loc.lng === "function" ? loc.lng() : loc.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const label = place.formatted_address || place.name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setOrigin(lat, lng, label, { skipSearchSync: true });
      });
    }

    if (els.locationReset) {
      els.locationReset.style.display = isAtDefaultOrigin() ? "none" : "";
    }

    setSummary(`Current location: ${state.origin.label}`);
    loadCategory(state.activeCategory);
  }).catch(() => {
    setStatus("API error", "error");
  });

  pf2Frame.addEventListener("click", handleFrameClick);
  pf2Frame.addEventListener("input", handleFrameInput);
  pf2Frame.addEventListener("change", handleFrameChange);
  pf2Frame.addEventListener("keydown", handleFrameKeydown);
  if (window.matchMedia("(max-width: 860px)").matches) {
    pf2Frame.classList.add("pf2-resultsCollapsed");
  }
  window.addEventListener("resize", () => {
    requestAnimationFrame(() => {
      if (state.map && window.google?.maps) google.maps.event.trigger(state.map, "resize");
    });
  });

  setupAiChat(pf2Frame, state, project, {
    selectPoi,
    loadCategory,
    setMode,
    aiSearch,
    setOrigin,
  });
}

function setupAiChat(pf2Frame, state, project, controls) {
  // The Gemini assistant lives as a footer inside the Places results
  // sidebar, immediately below the list of place rows. The user types
  // a request → the AI controls the map silently (focus / search /
  // category / mode). No chat panel, no streamed reply — only an
  // inline error toast above the field if something fails.
  const resultsPanel = pf2Frame.querySelector(".pf2-results");
  const target = resultsPanel || pf2Frame;
  if (getComputedStyle(target).position === "static") {
    target.style.position = "relative";
  }

  const root = document.createElement("form");
  root.className = "pf2-ai-bar";
  root.innerHTML = `
    <input class="pf2-ai-bar-input" type="text" maxlength="200" autocomplete="off" placeholder="Ask the map…" aria-label="Ask Gemini about this map" />
    <button class="pf2-ai-bar-submit" type="submit" aria-label="Submit to Gemini">
      <svg class="pf2-ai-bar-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="pf2GeminiBarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4285F4"/>
            <stop offset="50%" stop-color="#9B72F2"/>
            <stop offset="100%" stop-color="#D96570"/>
          </linearGradient>
        </defs>
        <path d="M12 2 C12.5 7.5 14.5 9.5 20 10 C14.5 10.5 12.5 12.5 12 18 C11.5 12.5 9.5 10.5 4 10 C9.5 9.5 11.5 7.5 12 2 Z" fill="url(#pf2GeminiBarGrad)"/>
      </svg>
    </button>
    <div class="pf2-ai-bar-error" data-pf2-ai-error role="status" aria-live="polite"></div>
  `;
  target.appendChild(root);

  const input = root.querySelector(".pf2-ai-bar-input");
  const submitBtn = root.querySelector(".pf2-ai-bar-submit");
  const errorBox = root.querySelector("[data-pf2-ai-error]");

  // Internal short-term context so follow-ups like "now by walking" work.
  // Capped at 6 turns; never displayed in the UI.
  const messages = [];
  let isSending = false;
  let lastSentAt = 0;
  let errorTimer = null;

  const showError = (text) => {
    if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
    errorBox.textContent = text;
    root.classList.add("has-error");
    errorTimer = setTimeout(() => {
      root.classList.remove("has-error");
      errorTimer = null;
    }, 4500);
  };

  const buildMapContext = () => ({
    property: {
      name: project.name || null,
      location: project.location || null,
      // Property's stored coords are kept distinct from the active
      // origin so the AI can reason about both ("how far from the
      // property?" vs "from where I'm searching now?").
      lat: project.store?.coords?.[1] ?? null,
      lng: project.store?.coords?.[0] ?? null,
      description: project.description || null,
    },
    activeOrigin: {
      lat: state.origin.lat,
      lng: state.origin.lng,
      label: state.origin.label,
    },
    activeCategory: state.activeCategory,
    activeBrand: state.activeBrand || null,
    travelMode: state.activeMode,
    aiQuery: state.aiQuery || null,
    pois: (state.pois || []).map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      distanceMeters: p.distance,
      durationSeconds: p.duration,
      isSelected: p.id === state.selectedPoiId,
    })),
  });

  // Each Gemini action drives an existing pf2 control so the map updates
  // feel native and the entire Places section stays in sync.
  const executeActions = async (actions) => {
    for (const action of actions) {
      if (action.type === "set_mode" && controls.setMode) {
        try { await controls.setMode(action.mode); } catch (_) { /* noop */ }
      } else if (action.type === "set_category" && controls.loadCategory) {
        try { await controls.loadCategory(action.category); } catch (_) { /* noop */ }
      } else if (action.type === "focus_poi" && controls.selectPoi) {
        try { await controls.selectPoi(action.poiId); } catch (_) { /* noop */ }
      } else if (action.type === "search_places" && controls.aiSearch) {
        try { await controls.aiSearch(action.query); } catch (_) { /* noop */ }
      } else if (action.type === "set_origin" && controls.setOrigin) {
        const lat = Number(action.lat);
        const lng = Number(action.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          try { await controls.setOrigin(lat, lng, action.label); } catch (_) { /* noop */ }
        }
      }
    }
  };

  const send = async (text) => {
    if (isSending) return;
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const now = Date.now();
    if (now - lastSentAt < 3000) {
      showError("Slow down a moment, then try again.");
      return;
    }
    lastSentAt = now;
    isSending = true;
    root.classList.add("is-loading");
    submitBtn.disabled = true;

    messages.push({ role: "user", content: trimmed });
    if (messages.length > 6) messages.shift();

    try {
      const res = await fetch("/.netlify/functions/gemini-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, mapContext: buildMapContext() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("Gemini assist error", { status: res.status, data });
        showError(data?.error || "The assistant is having trouble. Try again.");
        messages.pop();
        return;
      }
      const reply = String(data?.message || "").trim();
      const actions = Array.isArray(data?.actions) ? data.actions : [];
      messages.push({ role: "assistant", content: JSON.stringify({ message: reply, actions }) });
      if (messages.length > 6) messages.shift();
      if (actions.length) {
        await executeActions(actions);
      } else if (reply) {
        // No map action returned — surface the assistant's hint as a
        // short toast so the user knows what to try next. This is the
        // only case where text is shown to the user.
        showError(reply.length > 140 ? reply.slice(0, 140) + "…" : reply);
      }
      input.value = "";
    } catch (_) {
      showError("Network error. Try again.");
      messages.pop();
    } finally {
      isSending = false;
      root.classList.remove("is-loading");
      submitBtn.disabled = false;
    }
  };

  root.addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  // Prevent the form's default click-on-icon-children focusing the wrong thing.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      input.blur();
    }
  });
}

function renderProjectPage(bundle, homeBundle) {
  const project = buildProjectCard(bundle.project, bundle.developer);
  applySeo(bundle.project, `${bundle.project.name} - ATS`);
  if (soloBlock) soloBlock.style.display = "block";
  applyProjectViewportLayout();
  queueMapResize();

  byId("soloTitle").textContent = project.name;
  byId("soloSub").textContent = project.description;
  const mapHero = byId("projectMapHero");
  if (mapHero) {
    mapHero.style.display = "none";
    mapHero.setAttribute("aria-hidden", "true");
    const mapHeroImg = byId("projectMapHeroImg");
    const mapHeroTitle = byId("projectMapHeroTitle");
    const mapHeroLocation = byId("projectMapHeroLocation");
    if (mapHeroImg) {
      mapHeroImg.removeAttribute("src");
      mapHeroImg.alt = "";
    }
    if (mapHeroTitle) mapHeroTitle.textContent = "";
    if (mapHeroLocation) mapHeroLocation.textContent = "";
    mapHero.onclick = null;
  }
  const artistCard = byId("artistCard");
  if (bundle.developer) {
    if (artistCard) artistCard.style.display = "";
    renderArtist(project);
  } else if (artistCard) {
    artistCard.style.display = "none";
  }
  setProjectActionData(project);
  setupProjectMedia(project);
  const supportWrap = byId("projectSupportFrameWrap");
  if (supportWrap) supportWrap.style.display = "none";
  initProjectLocationFrame(project);
  gotoStore(project.popupStore || project.store);
  requestAnimationFrame(() => setMapEmbedModel(project.model, { reopen: true, open: true }));
  requestAnimationFrame(() => applyProjectViewportLayout());

  const backPath = getPreferredBackPath(bundle.developer ? `/developers/${encodeURIComponent(getDeveloperSlug(bundle.developer))}` : "/projects");
  byId("btnClose").onclick = () => navigateTo(backPath);
  byId("btnBack").onclick = (event) => {
    event.preventDefault();
    navigateTo(backPath);
  };
  byId("btnBack").setAttribute("href", backPath);
  byId("btnContact").onclick = () => navigateTo("/index.html#sect-contact");
  if (bundle.developer) {
    byId("openArtist").onclick = () => artistModal?.classList.add("open");
  }
}

function devUpdateDots() {
  if (!devDots) return;
  devDots.innerHTML = "";
  devSlides.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = `dev-dot${index === devIndex ? " active" : ""}`;
    devDots.appendChild(dot);
  });
}

function getCurrentDeveloperProject() {
  return devProjects[((devIndex % devProjects.length) + devProjects.length) % devProjects.length] || null;
}

function devShow(index) {
  if (!devSlides.length || !devSlideImg) return;
  devIndex = ((index % devSlides.length) + devSlides.length) % devSlides.length;
  const currentProject = getCurrentDeveloperProject();
  const targetCoords = currentProject?.popupStore?.coords || currentProject?.store?.coords || DEFAULT_COORDS;
  devSlideImg.style.opacity = 0;
  devSlideImg.onload = () => {
    devSlideImg.style.opacity = 1;
  };
  devSlideImg.src = devSlides[devIndex];
  devSlideImg.alt = currentProject?.name || `Developer slide ${devIndex + 1}`;
  devUpdateDots();
  setDeveloperListDropdown(true, activeDeveloperProfile, currentProject);
  setMapEmbedModel(currentProject?.model || DEFAULT_MODEL_URL, { reopen: true });
  byId("devTitle").textContent = currentProject?.name || activeDeveloperProfile?.name || "Developer";
  byId("devDesc").textContent = currentProject?.description || activeDeveloperProfile?.description || "Published developer profile.";

  if (devCamTimer) {
    clearTimeout(devCamTimer);
    devCamTimer = null;
  }
  withMapReady(() => {
    moveCamera({ center: targetCoords, zoom: DEV_ZOOM, pitch: DEV_PITCH, bearing: DEV_BEARING });
    devCamTimer = setTimeout(() => {
      const currentBearing = map?.getHeading?.() ?? DEV_BEARING;
      moveCamera({ center: targetCoords, zoom: DEV_ZOOM_CLOSE, pitch: DEV_PITCH_CLOSE, bearing: currentBearing + 35 });
    }, 10000);
  });
}

function renderDeveloperPage(bundle) {
  const developer = bundle.developer;
  const projects = bundle.projects || [];
  activeDeveloperProfile = developer;
  devProjects = projects.map((project) => buildProjectCard(project, developer));
  devSlides = devProjects.length ? devProjects.map((project) => project.img) : [developer.logo_url || DEFAULT_IMAGE_URL];

  applySeo(developer, `${developer.name} - ATS`);
  setCanonical(window.location.href);
  setDeveloperViewMode("lists");
  queueMapResize();
  closeMapEmbedPopup();

  const seeMore = byId("devSeeMore");
  seeMore.disabled = !devProjects.length;
  seeMore.style.opacity = devProjects.length ? "1" : ".6";
  seeMore.onclick = () => navigateTo(getCurrentDeveloperProject()?.href || "/projects");
  const backBtn = byId("devBackBtn");
  if (backBtn) {
    backBtn.style.display = "none";
  }

  devPrevBtn.onclick = () => devShow(devIndex - 1);
  devNextBtn.onclick = () => devShow(devIndex + 1);
  requestAnimationFrame(() => devShow(0));
}

function createDeveloperMapMarker(project, onClick) {
  const markerEl = document.createElement("button");
  markerEl.type = "button";
  markerEl.className = "developer-map-marker";
  markerEl.setAttribute("aria-label", project.name);

  const coords = project.popupStore?.coords || project.store?.coords || DEFAULT_COORDS;
  const position = latLngOf(coords);

  markerEl.addEventListener("mouseenter", () => {
    developerHoverPopup?.close?.();
    developerHoverPopup = new google.maps.InfoWindow({
      content: `<div class="developer-map-popup"><strong>${escapeHtml(project.name)}</strong></div>`,
      disableAutoPan: true,
      pixelOffset: new google.maps.Size(0, -18),
    });
    developerHoverPopup.setPosition(position);
    developerHoverPopup.open({ map });
  });

  markerEl.addEventListener("mouseleave", () => {
    developerHoverPopup?.close?.();
    developerHoverPopup = null;
  });

  markerEl.addEventListener("click", () => onClick?.(project.id));

  const marker = new google.maps.marker.AdvancedMarkerElement({
    map,
    position,
    content: markerEl,
  });

  return { id: project.id, marker, element: markerEl };
}

function updateDeveloperMarkerState() {
  developerMarkers.forEach((entry) => {
    entry.element.classList.toggle("is-active", entry.id === developerMapsSelectedId);
  });
}

function renderDeveloperExplorePage(bundle) {
  const developer = bundle.developer;
  const projects = (bundle.projects || []).map((project) => buildProjectCard(project, developer));
  const areas = getDeveloperAreas(projects);
  activeDeveloperProfile = developer;

  applySeo(developer, `${developer.name} - ATS`);
  setCanonical(window.location.href);
  setDeveloperViewMode("explore");
  queueMapResize();
  closeMapEmbedPopup();

  const logo = byId("developerExploreLogo");
  const title = byId("developerExploreTitle");
  const body = byId("developerExploreBody");
  const areasEl = byId("developerExploreAreas");
  const areaTitle = byId("developerExploreAreaTitle");
  const details = byId("developerExploreDetails");
  const projectsEl = byId("developerExploreProjects");
  const listsLink = byId("developerExploreListsLink");
  const mapsLink = byId("developerExploreMapsLink");
  const backLink = byId("developerExploreBackLink");

  if (logo) {
    logo.src = developer.logo_url || projects[0]?.img || DEFAULT_IMAGE_URL;
    logo.alt = `${developer.name} logo`;
  }
  if (title) title.textContent = developer.name;
  if (body) body.textContent = developer.description || "Published developer profile.";
  if (areaTitle) areaTitle.textContent = areas.length > 1 ? "Coverage Areas" : "Coverage Area";
  if (areasEl) {
    areasEl.innerHTML = areas.map((area) => `<span class="developer-explore-tag">${escapeHtml(area)}</span>`).join("");
  }
  if (details) {
    details.innerHTML = [
      developer.website_url ? `<div class="developer-explore-line"><span>Website</span><a href="${escapeHtml(developer.website_url)}" target="_blank" rel="noreferrer">${escapeHtml(developer.website_url)}</a></div>` : "",
      developer.email ? `<div class="developer-explore-line"><span>Email</span><a href="mailto:${escapeHtml(developer.email)}">${escapeHtml(developer.email)}</a></div>` : "",
      developer.phone ? `<div class="developer-explore-line"><span>Phone</span><a href="tel:${escapeHtml(developer.phone)}">${escapeHtml(developer.phone)}</a></div>` : "",
      `<div class="developer-explore-line"><span>Published Projects</span><span>${projects.length}</span></div>`,
    ].filter(Boolean).join("");
  }
  if (projectsEl) {
    projectsEl.innerHTML = projects.length
      ? projects.map((project) => `
          <article class="developer-explore-project">
            <img src="${escapeHtml(project.img)}" alt="${escapeHtml(project.name)}">
            <div class="developer-explore-project-meta">${escapeHtml(project.location || "Riyadh")}</div>
            <h3>${escapeHtml(project.name)}</h3>
            <p>${escapeHtml(project.description || "Published project")}</p>
            <a class="developer-maps-project-btn developer-maps-project-btn--dark" href="${escapeHtml(project.href)}">Open Project</a>
          </article>
        `).join("")
      : `<div class="legacy-empty">No published projects found for this developer.</div>`;
  }

  listsLink?.setAttribute("href", buildDeveloperPath(developer, "lists"));
  mapsLink?.setAttribute("href", buildDeveloperPath(developer, "maps"));
  backLink?.setAttribute("href", getPreferredBackPath("/developers"));

  withMapReady(() => {
    clearDeveloperMapArtifacts();
    projects.forEach((project) => {
      developerMarkers.push(createDeveloperMapMarker(project));
    });
    fitMapToCoords(projects.map((project) => project.popupStore?.coords || project.store?.coords || DEFAULT_COORDS), {
      padding: { top: 110, right: 80, bottom: 80, left: 80 },
      maxZoom: 12.6,
      zoom: 11.6,
      pitch: 26,
      bearing: 10,
    });
  });
}

function renderDeveloperMapsSummary(developer, projects, selectedProject = null) {
  const summaryEl = byId("developerMapsSummary");
  if (!summaryEl) return;

  if (!selectedProject) {
    const areas = getDeveloperAreas(projects);
    summaryEl.innerHTML = `
      <div class="developer-maps-card-head">
        <div class="developer-maps-card-logo"><img src="${escapeHtml(developer.logo_url || projects[0]?.img || DEFAULT_IMAGE_URL)}" alt="${escapeHtml(developer.name)} logo"></div>
        <div>
          <div class="developer-maps-card-kicker">Developer Summary</div>
          <h1 class="developer-maps-card-title">${escapeHtml(developer.name)}</h1>
        </div>
      </div>
      <p class="developer-maps-card-copy">${escapeHtml(developer.description || "Published developer profile.")}</p>
      <div class="developer-maps-meta">
        <span>${projects.length} project(s)</span>
        ${areas.map((area) => `<span>${escapeHtml(area)}</span>`).join("")}
      </div>
    `;
    return;
  }

  summaryEl.innerHTML = `
    <div class="developer-maps-card-head">
      <div class="developer-maps-card-logo"><img src="${escapeHtml(selectedProject.img || developer.logo_url || DEFAULT_IMAGE_URL)}" alt="${escapeHtml(selectedProject.name)}"></div>
      <div>
        <div class="developer-maps-card-kicker">Selected Project</div>
        <h1 class="developer-maps-card-title">${escapeHtml(selectedProject.name)}</h1>
      </div>
    </div>
    <p class="developer-maps-card-copy">${escapeHtml(selectedProject.description || "Published project")}</p>
    <div class="developer-maps-meta">
      <span>${escapeHtml(selectedProject.location || "Riyadh")}</span>
      <span>${escapeHtml(developer.name)}</span>
      ${canManagePublicProjectStatuses() ? `<span>Status: ${escapeHtml(getPublicProjectStatusLabel(selectedProject.status))}</span>` : ""}
    </div>
  `;
}

function renderDeveloperMapsProjects(developer, projects) {
  const projectsEl = byId("developerMapsProjects");
  if (!projectsEl) return;

  projectsEl.innerHTML = projects.length
    ? projects.map((project) => `
        <article class="developer-maps-project" data-developer-map-project-id="${escapeHtml(project.id)}" data-developer-map-href="${escapeHtml(project.href)}" tabindex="0" role="link" aria-label="Open ${escapeHtml(project.name)}">
          <div class="developer-maps-project-thumb">
            <img src="${escapeHtml(project.img)}" alt="${escapeHtml(project.name)}">
          </div>
          <div class="developer-maps-project-copy">
            <div class="developer-maps-project-kicker">${escapeHtml(project.location || "Riyadh")}</div>
            <h2 class="developer-maps-project-title">${escapeHtml(project.name)}</h2>
            <p class="developer-maps-project-desc">${escapeHtml(project.description || "Published project")}</p>
            <div class="developer-maps-project-actions">
              <button class="developer-maps-project-btn developer-maps-project-btn--dark developer-maps-project-btn--focus" type="button" data-developer-map-focus="${escapeHtml(project.id)}" aria-label="Focus ${escapeHtml(project.name)} on the map" title="Focus on Map">
                <span class="developer-maps-project-btn-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M21.6 2.4a1 1 0 0 0-1.1-.2L3.5 9.2a1 1 0 0 0 .1 1.9l7 1.7 1.7 7a1 1 0 0 0 1.9.1l7-17a1 1 0 0 0-.6-1.5z"/></svg>
                </span>
                <span class="developer-maps-project-btn-text">Focus on Map</span>
              </button>
              ${canManagePublicProjectStatuses() ? `<span class="developer-maps-project-btn developer-maps-project-status-badge" data-status="${escapeHtml(project.status || "draft")}" aria-label="Project status">${escapeHtml(getPublicProjectStatusLabel(project.status))}</span>` : ""}
            </div>
          </div>
        </article>
      `).join("")
    : `<div class="legacy-empty">No published projects found for this developer.</div>`;

  // Whole-card click → open the project. Focus button (and the status
  // badge) stop propagation so they don't trigger navigation.
  projectsEl.querySelectorAll(".developer-maps-project").forEach((card) => {
    const href = card.getAttribute("data-developer-map-href");
    const open = (e) => {
      // Modifier-aware: let the browser handle Cmd/Ctrl-click as a new tab
      // if the user wants. We always navigate within the same tab here
      // because there's no anchor to honor; if you need new-tab behavior
      // we can switch the article to an <a>.
      if (e && e.target.closest("[data-developer-map-focus]")) return;
      if (e && e.target.closest(".developer-maps-project-status-badge")) return;
      if (href) navigateTo(href);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });

  projectsEl.querySelectorAll("[data-developer-map-focus]").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.stopPropagation();
      selectDeveloperMapProject(developer, projects, button.getAttribute("data-developer-map-focus"));
    });
  });
}

function selectDeveloperMapProject(developer, projects, projectId) {
  const project = projects.find((item) => item.id === projectId);
  if (!project) return;

  developerMapsSelectedId = project.id;
  renderDeveloperMapsSummary(developer, projects, project);
  updateDeveloperMarkerState();
  byId("developerMapsProjects")?.querySelectorAll("[data-developer-map-project-id]").forEach((card) => {
    card.classList.toggle("is-active", card.getAttribute("data-developer-map-project-id") === project.id);
  });

  const card = byId("developerMapsProjects")?.querySelector(`[data-developer-map-project-id="${project.id}"]`);
  card?.scrollIntoView({ behavior: "smooth", block: "start" });
  setMapEmbedModel(project.model || DEFAULT_MODEL_URL, { reopen: true, open: true });
  withMapReady(() => {
    moveCamera({
      center: project.popupStore?.coords || project.store?.coords || DEFAULT_COORDS,
      zoom: 15.4,
      pitch: 62,
      bearing: 28,
    });
  });
}

function resetDeveloperMapsView(developer, projects) {
  developerMapsSelectedId = null;
  renderDeveloperMapsSummary(developer, projects, null);
  updateDeveloperMarkerState();
  byId("developerMapsProjects")?.querySelectorAll("[data-developer-map-project-id]").forEach((card) => {
    card.classList.remove("is-active");
  });
  closeMapEmbedPopup();
  withMapReady(() => {
    fitMapToCoords(projects.map((project) => project.popupStore?.coords || project.store?.coords || DEFAULT_COORDS), {
      padding: { top: 140, right: 120, bottom: 120, left: 120 },
      maxZoom: 12.8,
      zoom: 11.6,
      pitch: 22,
      bearing: 8,
    });
  });
}

function bindDeveloperListDropdown() {
  if (!developerExploreNavPill || !developerExploreNavDropdown || !developerExploreNavShell) return;

  developerExploreNavPill.addEventListener("click", (event) => {
    if (!developerNavDropdownEnabled) return;
    event.preventDefault();
    const nextOpen = !developerExploreNavShell.classList.contains("is-open");
    developerExploreNavShell.classList.toggle("is-open", nextOpen);
    developerExploreNavPill.setAttribute("aria-expanded", nextOpen ? "true" : "false");
  });

  document.addEventListener("click", (event) => {
    if (!developerNavDropdownEnabled) return;
    if (!developerExploreNavShell.contains(event.target)) {
      hideDeveloperListDropdown();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideDeveloperListDropdown();
    }
  });
}

function renderDeveloperMapsPage(bundle) {
  const developer = bundle.developer;
  const projects = (bundle.projects || []).map((project) => buildProjectCard(project, developer));
  activeDeveloperProfile = developer;
  developerMapsSelectedId = null;
  const requestedProjectSlug = getRequestedDeveloperProjectSlug();

  applySeo(developer, `${developer.name} Map View - ATS`);
  setCanonical(window.location.href);
  setDeveloperViewMode("maps");
  queueMapResize();

  byId("developerMapsListsLink")?.setAttribute("href", buildDeveloperPath(developer, "lists"));
  byId("developerMapsBackLink")?.setAttribute("href", getPreferredBackPath("/developers"));
  byId("developerMapsResetBtn")?.addEventListener("click", () => resetDeveloperMapsView(developer, projects));

  renderDeveloperMapsSummary(developer, projects, null);
  renderDeveloperMapsProjects(developer, projects);

  withMapReady(() => {
    clearDeveloperMapArtifacts();
    projects.forEach((project) => {
      developerMarkers.push(createDeveloperMapMarker(project, (projectId) => selectDeveloperMapProject(developer, projects, projectId)));
    });
    resetDeveloperMapsView(developer, projects);
    if (requestedProjectSlug) {
      const requestedProject = projects.find((project) => project.href.split("/").filter(Boolean).pop() === requestedProjectSlug);
      if (requestedProject) {
        selectDeveloperMapProject(developer, projects, requestedProject.id);
      }
    }
  });
}

async function bootstrapDeveloperPage() {
  const route = getDeveloperRouteInfo();
  const slug = route.slug;
  if (!slug) {
    renderLegacyError("Developer not found.");
    return;
  }
  const [initialBundle] = await Promise.all([
    fetchPublishedDeveloperBundle(slug),
    resolveCurrentViewerProfile(),
  ]);
  if (!initialBundle) {
    renderLegacyError("Developer not found.");
    return;
  }

  let bundle = initialBundle;

  // Password-protected developers come back from the public view with their
  // sensitive fields stripped and projects list empty. Call the unlock
  // function — first with a persisted token, then via the password modal.
  if (bundle.developer?.password_protected) {
    const cacheKey = String(bundle.developer.id || slug);
    const storedToken = readDeveloperUnlockToken(cacheKey);
    if (storedToken) {
      const tokenAttempt = await unlockDeveloperBundle(slug, { token: storedToken });
      if (tokenAttempt.ok && tokenAttempt.bundle) {
        bundle = tokenAttempt.bundle;
        if (tokenAttempt.token && tokenAttempt.token !== storedToken) {
          writeDeveloperUnlockToken(cacheKey, tokenAttempt.token);
        }
      } else {
        writeDeveloperUnlockToken(cacheKey, null);
      }
    }
    if (bundle.developer?.password_protected) {
      try {
        bundle = await showDeveloperPasswordGate(slug, bundle.developer);
      } catch (_) {
        renderLegacyError("This developer page is password protected.");
        return;
      }
    }
  }

  if (route.view === "explore") {
    renderDeveloperExplorePage(bundle);
    return;
  }
  if (route.view === "maps") {
    renderDeveloperMapsPage(bundle);
    return;
  }
  renderDeveloperPage(bundle);
}

const PROJECT_UNLOCK_STORAGE_PREFIX = "ats:project-unlock:";
const DEVELOPER_UNLOCK_STORAGE_PREFIX = "ats:developer-unlock:";

function readDeveloperUnlockToken(key) {
  try { return window.localStorage.getItem(DEVELOPER_UNLOCK_STORAGE_PREFIX + key) || null; }
  catch (_) { return null; }
}
function writeDeveloperUnlockToken(key, token) {
  try {
    if (token) window.localStorage.setItem(DEVELOPER_UNLOCK_STORAGE_PREFIX + key, token);
    else window.localStorage.removeItem(DEVELOPER_UNLOCK_STORAGE_PREFIX + key);
  } catch (_) { /* storage unavailable */ }
}

// Render the password gate modal in front of the hidden developer body.
// Resolves with the full unlocked bundle from the unlock function — it
// replaces the placeholder we got from the public view.
function showDeveloperPasswordGate(slug, lockedDeveloper) {
  return new Promise((resolve) => {
    if (developerBlock) developerBlock.style.display = "none";
    if (developerExploreBlock) developerExploreBlock.style.display = "none";
    if (developerMapsBlock) developerMapsBlock.style.display = "none";

    let overlay = document.getElementById("developerPasswordGate");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "developerPasswordGate";
      overlay.className = "project-gate";
      overlay.innerHTML = `
        <div class="project-gate-card" role="dialog" aria-modal="true" aria-labelledby="developerGateTitle">
          <div class="project-gate-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2"/>
              <path d="M8 11V7a4 4 0 1 1 8 0v4"/>
            </svg>
          </div>
          <h2 class="project-gate-title" id="developerGateTitle">Password required</h2>
          <p class="project-gate-sub" data-pg-name></p>
          <form class="project-gate-form" data-pg-form>
            <input class="project-gate-input" type="password" placeholder="Enter developer password" autocomplete="off" data-pg-input maxlength="200" required />
            <button class="project-gate-submit" type="submit" data-pg-submit>Unlock</button>
          </form>
          <p class="project-gate-error" data-pg-error hidden></p>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const nameEl = overlay.querySelector("[data-pg-name]");
    const form = overlay.querySelector("[data-pg-form]");
    const input = overlay.querySelector("[data-pg-input]");
    const submit = overlay.querySelector("[data-pg-submit]");
    const errorEl = overlay.querySelector("[data-pg-error]");

    nameEl.textContent = lockedDeveloper?.name
      ? `Enter the password to view "${lockedDeveloper.name}".`
      : "Enter the developer password to continue.";
    overlay.classList.add("is-open");
    requestAnimationFrame(() => input.focus());

    const close = () => {
      overlay.classList.remove("is-open");
      form.replaceWith(form.cloneNode(true));
    };

    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = (input.value || "").trim();
      if (!password) return;
      submit.disabled = true;
      submit.textContent = "Checking…";
      errorEl.hidden = true;
      const result = await unlockDeveloperBundle(slug, { password });
      submit.disabled = false;
      submit.textContent = "Unlock";
      if (result.ok && result.bundle) {
        const cacheKey = String(result.bundle.developer?.id || lockedDeveloper?.id || slug);
        if (result.token) writeDeveloperUnlockToken(cacheKey, result.token);
        close();
        resolve(result.bundle);
        return;
      }
      showError(result.error || "Incorrect password. Please try again.");
      input.select();
    });
  });
}

function readUnlockToken(slug) {
  try { return window.localStorage.getItem(PROJECT_UNLOCK_STORAGE_PREFIX + slug) || null; }
  catch (_) { return null; }
}
function writeUnlockToken(slug, token) {
  try {
    if (token) window.localStorage.setItem(PROJECT_UNLOCK_STORAGE_PREFIX + slug, token);
    else window.localStorage.removeItem(PROJECT_UNLOCK_STORAGE_PREFIX + slug);
  } catch (_) { /* storage unavailable — fall back to per-pageload memory */ }
}

// Render the password gate modal in front of a hidden project body. Resolves
// when the user has supplied a correct password (or rejects on cancel/back).
// The bundle that comes back is the full unlocked bundle from the unlock
// function — it replaces the placeholder we got from the public view.
function showProjectPasswordGate(slug, lockedProject) {
  return new Promise((resolve, reject) => {
    if (soloBlock) soloBlock.style.display = "none";
    let overlay = document.getElementById("projectPasswordGate");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "projectPasswordGate";
      overlay.className = "project-gate";
      overlay.innerHTML = `
        <div class="project-gate-card" role="dialog" aria-modal="true" aria-labelledby="projectGateTitle">
          <div class="project-gate-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="11" width="16" height="10" rx="2"/>
              <path d="M8 11V7a4 4 0 1 1 8 0v4"/>
            </svg>
          </div>
          <h2 class="project-gate-title" id="projectGateTitle">Password required</h2>
          <p class="project-gate-sub" data-pg-name></p>
          <form class="project-gate-form" data-pg-form>
            <input class="project-gate-input" type="password" placeholder="Enter project password" autocomplete="off" data-pg-input maxlength="200" required />
            <button class="project-gate-submit" type="submit" data-pg-submit>Unlock</button>
          </form>
          <p class="project-gate-error" data-pg-error hidden></p>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const nameEl = overlay.querySelector("[data-pg-name]");
    const form = overlay.querySelector("[data-pg-form]");
    const input = overlay.querySelector("[data-pg-input]");
    const submit = overlay.querySelector("[data-pg-submit]");
    const errorEl = overlay.querySelector("[data-pg-error]");

    nameEl.textContent = lockedProject?.name
      ? `Enter the password to view "${lockedProject.name}".`
      : "Enter the project password to continue.";
    overlay.classList.add("is-open");
    requestAnimationFrame(() => input.focus());

    const close = () => {
      overlay.classList.remove("is-open");
      // Detach handlers so a future open is fresh.
      form.replaceWith(form.cloneNode(true));
    };

    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const password = (input.value || "").trim();
      if (!password) return;
      submit.disabled = true;
      submit.textContent = "Checking…";
      errorEl.hidden = true;
      const result = await unlockProjectBundle(slug, { password });
      submit.disabled = false;
      submit.textContent = "Unlock";
      if (result.ok && result.bundle) {
        if (result.token) writeUnlockToken(slug, result.token);
        close();
        resolve(result.bundle);
        return;
      }
      showError(result.error || "Incorrect password. Please try again.");
      input.select();
    });
  });
}

async function bootstrapProjectPage() {
  const slug = getCurrentSlug();
  if (!slug) {
    renderLegacyError("Project not found.");
    return;
  }
  const [initialBundle, homeBundle] = await Promise.all([
    fetchPublishedProjectBundle(slug),
    fetchPublishedPageBundleByRoute({ slugs: ["home"], canonicalUrl: `${window.location.origin}/` }),
  ]);
  if (!initialBundle) {
    renderLegacyError("Project not found.");
    return;
  }

  let bundle = initialBundle;

  // Password-protected projects come back from the public view with their
  // sensitive fields stripped. We need to call the unlock function to get
  // the full content — first with the persisted token, then with the
  // password if the token isn't valid (or doesn't exist yet).
  if (bundle.project?.password_protected) {
    // Use the project's UUID as the lookup key — it's stable and the unlock
    // function can find it unambiguously regardless of URL slug form.
    const projectKey = String(bundle.project.id || slug);
    const storedToken = readUnlockToken(projectKey);
    if (storedToken) {
      const tokenAttempt = await unlockProjectBundle(projectKey, { token: storedToken });
      if (tokenAttempt.ok && tokenAttempt.bundle) {
        bundle = tokenAttempt.bundle;
        if (tokenAttempt.token && tokenAttempt.token !== storedToken) {
          writeUnlockToken(projectKey, tokenAttempt.token);
        }
      } else {
        // Stored token is stale (admin changed the password, etc.) — clear
        // it so we don't keep retrying with the same bad value.
        writeUnlockToken(projectKey, null);
      }
    }
    if (bundle.project?.password_protected) {
      // Still locked — show the gate. Resolves with the full bundle.
      try {
        bundle = await showProjectPasswordGate(projectKey, bundle.project);
      } catch (_) {
        renderLegacyError("This project is password protected.");
        return;
      }
    }
  }

  bindProjectLayoutResize();
  if (soloBlock) soloBlock.style.display = "block";
  renderProjectPage(bundle, homeBundle);
}

async function bootstrap() {
  bindModalUi();
  bindDeveloperListDropdown();
  initMap();
  configureMapEmbedViewer(mapEmbedModel);
  if (mapEmbedModel) {
    mapEmbedModel.addEventListener("load", () => configureMapEmbedViewer(mapEmbedModel), { once: true });
  }

  if (!hasClientConfig()) {
    renderLegacyError("Missing Supabase config.");
    return;
  }

  try {
    if (pageType === "developer") {
      await bootstrapDeveloperPage();
      return;
    }
    if (pageType === "project") {
      await bootstrapProjectPage();
      return;
    }
    if (pageType === "cla") {
      bootstrapClaPage();
      return;
    }
  } catch (error) {
    renderLegacyError(error.message || "Failed to load page.");
  }
}

// Standalone "CLA" page — only the Nearby Places block, centered on
// Riyadh by default. No Supabase project bundle, no developer dropdown,
// no media gallery; the rest of legacy-detail-pages skips silently
// when its DOM hooks aren't present.
function bootstrapClaPage() {
  initProjectLocationFrame({
    store: { coords: DEFAULT_COORDS },
    location: "Riyadh",
    name: "CLA",
  });
}

bootstrap();
