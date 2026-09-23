const SPEEDS = { foot: 1.4, bike: 4.2, car: 16.7 };
const OSRM_PROFILES = { foot: 'foot', bike: 'bike', car: 'driving' };
let warnings = [];

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function addWarning(message) {
    warnings.push(message);
    console.warn('⚠️ WARNING:', message);
}

function showWarnings() {
    const warningBox = document.getElementById('warningBox');
    if (warnings.length > 0 && warningBox) {
        warningBox.innerHTML = '<strong>⚠️ Предупреждения:</strong><br>' + 
            warnings.map(w => '• ' + w).join('<br>');
        warningBox.style.display = 'block';
    }
}

function clearWarnings() {
    warnings = [];
    const warningBox = document.getElementById('warningBox');
    if (warningBox) {
        warningBox.style.display = 'none';
        warningBox.innerHTML = '';
    }
}

function extractCoordinates(url) {
    // Декодируем URL, чтобы превратить %2C обратно в обычные запятые
    const decodedUrl = decodeURIComponent(url);
    const regex = /(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/g;
    const matches = [...decodedUrl.matchAll(regex)];
    const points = [];
    const seen = new Set();
    
    for (const match of matches) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
            if (!seen.has(key)) {
                seen.add(key);
                points.push({ lat, lon });
            }
        }
    }
    return points;
}

async function getRouteFromOSRM(points, profile) {
    if (points.length < 2) throw new Error('Нужно минимум 2 точки для построения маршрута');
    const osrmProfile = OSRM_PROFILES[profile] || 'driving';
    const coordinates = points.map(p => `${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${coordinates}?overview=full&geometries=geojson&alternatives=false`;

    try {
        const response = await fetch(url, { timeout: 15000 });
        if (!response.ok) throw new Error(`OSRM API error: ${response.status}`);
        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error('Маршрут не найден. Проверьте координаты.');
        return data.routes[0];
    } catch (error) {
        if (error.name === 'TimeoutError') {
            throw new Error('Превышено время ожидания ответа от сервера маршрутизации');
        }
        throw error;
    }
}

function interpolateRoute(routeGeometry, timeInterval, speed) {
    const coordinates = routeGeometry.coordinates;
    const trackPoints = [];
    const startTime = new Date();
    let totalDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
        totalDistance += haversineDistance(coordinates[i-1][1], coordinates[i-1][0], coordinates[i][1], coordinates[i][0]);
    }

    const totalPoints = Math.max(1, Math.ceil(totalDistance / (speed * timeInterval)));
    
    for (let i = 0; i <= totalPoints; i++) {
        const progress = i / totalPoints;
        const point = getPointAlongRoute(coordinates, progress);
        const time = new Date(startTime.getTime() + (i * timeInterval * 1000));
        
        trackPoints.push({
            lat: point[1].toFixed(6),
            lon: point[0].toFixed(6),
            time: time.toISOString()
        });
    }
    return { trackPoints, totalDistance };
}

function getPointAlongRoute(coordinates, progress) {
    if (coordinates.length === 0) return [0, 0];
    if (coordinates.length === 1) return coordinates[0];
    if (progress <= 0) return coordinates[0];
    if (progress >= 1) return coordinates[coordinates.length - 1];

    const totalSegments = coordinates.length - 1;
    const targetSegment = Math.floor(progress * totalSegments);
    const segmentProgress = (progress * totalSegments) - targetSegment;
    const start = coordinates[targetSegment];
    const end = coordinates[Math.min(targetSegment + 1, coordinates.length - 1)];

    return [
        start[0] + (end[0] - start[0]) * segmentProgress,
        start[1] + (end[1] - start[1]) * segmentProgress
    ];
}

function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function convertToGPX() {
    clearWarnings();
    
    const urlInput = document.getElementById('urlInput');
    const travelMode = document.getElementById('travelMode');
    const timeIntervalInput = document.getElementById('timeInterval');
    
    const url = urlInput ? urlInput.value.trim() : '';
    const mode = travelMode ? travelMode.value : 'car';
    const intervalSec = timeIntervalInput ? parseInt(timeIntervalInput.value) || 10 : 10;
    
    const errorDiv = document.getElementById('errorMsg');
    const resultBox = document.getElementById('resultBox');
    const loading = document.getElementById('loading');
    const btn = document.getElementById('convertBtn');

    if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
    }
    if (resultBox) resultBox.style.display = 'none';
    if (loading) loading.style.display = 'block';
    if (btn) btn.disabled = true;

    try {
        if (!url) throw new Error('Пожалуйста, вставьте ссылку');

        const waypoints = extractCoordinates(url);
        if (waypoints.length < 2) throw new Error('Не удалось найти минимум 2 пары координат в ссылке');

        setText('loadingText', '1/2. Строю маршрут по дорогам...');
        setText('progressText', '');
        const route = await getRouteFromOSRM(waypoints, mode);
        
        setText('loadingText', '2/2. Генерирую GPX файл...');
        const { trackPoints, totalDistance } = interpolateRoute(route.geometry, intervalSec, SPEEDS[mode]);
        const gpx = generateGPX(trackPoints, mode, intervalSec);

        setText('waypointCount', waypoints.length);
        setText('trackPointCount', trackPoints.length);
        setText('totalDistance', (totalDistance / 1000).toFixed(2));
        
        const blob = new Blob([gpx], { type: 'application/gpx+xml' });
        const urlObj = URL.createObjectURL(blob);
        const downloadLink = document.getElementById('downloadLink');
        if (downloadLink) {
            downloadLink.href = urlObj;
            downloadLink.download = `route_${mode}_${Date.now()}.gpx`;
        }
        
        if (resultBox) resultBox.style.display = 'block';
        showWarnings();

    } catch (error) {
        console.error('Critical error:', error);
        if (errorDiv) {
            errorDiv.textContent = `❌ ${error.message}`;
            errorDiv.style.display = 'block';
        }
    } finally {
        if (loading) loading.style.display = 'none';
        if (btn) btn.disabled = false;
    }
}

function generateGPX(trackPoints, mode, interval) {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="MapToGPX-OSRM" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    gpx += `  <metadata>\n`;
    gpx += `    <name>Маршрут из Maps (по дорогам)</name>\n`;
    gpx += `    <desc>Режим: ${mode}, интервал: ${interval}с</desc>\n`;
    gpx += `    <time>${trackPoints[0]?.time || new Date().toISOString()}</time>\n`;
    gpx += `  </metadata>\n`;
    gpx += `  <trk>\n`;
    gpx += `    <name>Основной трек</name>\n`;
    gpx += `    <trkseg>\n`;
    
    for (const pt of trackPoints) {
        gpx += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
        gpx += `        <time>${pt.time}</time>\n`;
        gpx += `      </trkpt>\n`;
    }
    gpx += `    </trkseg>\n  </trk>\n</gpx>`;
    return gpx;
}