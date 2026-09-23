const map = L.map('map').setView([55.75, 37.61], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
    maxZoom: 19
}).addTo(map);

let currentGpxLayer = null;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const statsPanel = document.getElementById('statsPanel');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
    if (!file.name.endsWith('.gpx')) {
        alert('Пожалуйста, выберите файл с расширением .gpx');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const gpxText = e.target.result;
        loadGPX(gpxText);
    };
    reader.readAsText(file);
}

function loadGPX(gpxText) {
    if (currentGpxLayer) {
        map.removeLayer(currentGpxLayer);
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(gpxText, "text/xml");
    const trkpts = xmlDoc.getElementsByTagName("trkpt");
    
    const trackData = [];
    let totalDist = 0;
    let startTime = null;
    let endTime = null;

    for (let i = 0; i < trkpts.length; i++) {
        const lat = parseFloat(trkpts[i].getAttribute("lat"));
        const lon = parseFloat(trkpts[i].getAttribute("lon"));
        const timeNode = trkpts[i].getElementsByTagName("time")[0];
        const time = timeNode ? new Date(timeNode.textContent) : null;

        if (i === 0) {
            startTime = time;
        } else {
            const prev = trackData[i - 1];
            const dist = haversineDistance(prev.lat, prev.lon, lat, lon);
            totalDist += dist;
        }
        
        endTime = time;
        trackData.push({ lat, lon, time, dist: totalDist });
    }

    const blob = new Blob([gpxText], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    
    currentGpxLayer = new L.GPX(url, {
        async: true,
        marker_options: {
            startIconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="%2327ae60" stroke="white" stroke-width="2"/></svg>',
            endIconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="%23e74c3c" stroke="white" stroke-width="2"/></svg>',
            shadowUrl: '',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        },
        polyline_options: {
            color: '#3498db',
            opacity: 0.8,
            weight: 4,
            lineCap: 'round'
        }
    }).on('loaded', function(e) {
        map.fitBounds(e.target.getBounds());
    }).addTo(map);

    document.getElementById('statDist').textContent = (totalDist / 1000).toFixed(2);
    document.getElementById('statPoints').textContent = trackData.length;
    
    if (startTime && endTime) {
        const diffMs = endTime - startTime;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        document.getElementById('statTime').textContent = `${hours}ч ${mins}м`;
    } else {
        document.getElementById('statTime').textContent = "Н/Д";
    }

    statsPanel.classList.remove('hidden');
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