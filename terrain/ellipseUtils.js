/**
 * Track analytics data for a vertex
 * @param {Object} analyticsData - Object to store analytics data
 * @param {Array} color - RGB color array
 * @param {Object} terrainData - Terrain data object
 * @param {number} theta - Elevation angle
 * @param {number} phi - Azimuth angle
 */
export function trackAnalytics(analyticsData, color, terrainData, theta, phi) {
    // Track color usage
    const colorKey = color.join(',');
    analyticsData.colorCounts[colorKey] = (analyticsData.colorCounts[colorKey] || 0) + 1;
    
    // Track height and temperature
    analyticsData.heightValues.push(terrainData.height);
    if (terrainData.temperature !== undefined) {
        analyticsData.temperatureValues.push(terrainData.temperature);
    }
    
    // Track features
    if (terrainData.features && Array.isArray(terrainData.features)) {
        terrainData.features.forEach(feature => {
            // Count feature occurrences
            analyticsData.featureCounts[feature] = (analyticsData.featureCounts[feature] || 0) + 1;
            
            // Track feature for contiguity analysis - store actual theta/phi values
            // Using a lower precision key to avoid fragmentation
            const key = `${(theta).toFixed(3)},${(phi).toFixed(3)}`;
            if (!analyticsData.featureMap.has(key)) {
                analyticsData.featureMap.set(key, []);
            }
            analyticsData.featureMap.get(key).push(feature);
        });
    }
}

/**
 * Handle wraparound for spherical coordinates
 * @param {number} phi - Azimuth angle to normalize
 * @returns {number} - Normalized phi in [0, 2π)
 */
function normalizePhiCoordinate(phi) {
    // Handle wraparound for φ coordinate (longitude)
    while (phi < 0) phi += 2 * Math.PI;
    while (phi >= 2 * Math.PI) phi -= 2 * Math.PI;
    return phi;
}

/**
 * Check if two grid cells are neighbors considering spherical wraparound
 * @param {Array} coord1 - [theta, phi] of first cell
 * @param {Array} coord2 - [theta, phi] of second cell
 * @param {number} threshold - Maximum distance to consider as neighbors
 * @returns {boolean} - True if cells are neighbors
 */
function areNeighbors(coord1, coord2, threshold = 0.2) {
    const [theta1, phi1] = coord1;
    const [theta2, phi2] = coord2;
    
    // Handle regular grid distance
    let dTheta = Math.abs(theta1 - theta2);
    
    // Calculate minimum phi distance considering wraparound
    let dPhi = Math.abs(phi1 - phi2);
    if (dPhi > Math.PI) {
        dPhi = 2 * Math.PI - dPhi; // Take the shorter path around the circle
    }
    
    // Special case for poles (theta near 0 or π)
    const atPole = (theta1 < 0.1 || theta1 > Math.PI - 0.1 || 
                    theta2 < 0.1 || theta2 > Math.PI - 0.1);
    
    if (atPole) {
        // Near poles, phi differences matter less
        return dTheta < threshold;
    } else {
        // Regular case - cells are neighbors if they're close in both coordinates
        return dTheta < threshold && dPhi < threshold;
    }
}

/**
 * Calculate contiguous regions for each feature type and their centers
 * @param {Map} featureMap - Map of coordinates to features
 * @returns {Object} - Object containing count and centers of contiguous regions
 */
export function calculateContiguousFeatures(featureMap) {
    const visited = new Set();
    const contiguousCounts = {};
    const contiguousCenters = {}; 
    
    // Extract feature types
    const featureTypes = new Set();
    featureMap.forEach(features => {
        features.forEach(feature => featureTypes.add(feature));
    });
    
    // Create a spatial index of points for each feature type
    const featurePoints = {};
    featureTypes.forEach(featureType => {
        featurePoints[featureType] = [];
        contiguousCenters[featureType] = [];
        contiguousCounts[featureType] = 0;
    });
    
    // Populate the spatial index
    for (const [key, features] of featureMap.entries()) {
        const [theta, phi] = key.split(',').map(Number);
        features.forEach(feature => {
            featurePoints[feature].push({
                coords: [theta, phi],
                key: key
            });
        });
    }
    
    // For each feature type, find contiguous regions using BFS
    for (const featureType of featureTypes) {
        const points = featurePoints[featureType];
        
        for (let i = 0; i < points.length; i++) {
            const startPoint = points[i];
            if (visited.has(`${startPoint.key}-${featureType}`)) continue;
            
            // Found a new region
            const regionIndex = contiguousCounts[featureType];
            contiguousCounts[featureType]++;
            
            // BFS to find connected cells
            const queue = [startPoint];
            const regionCells = [];
            visited.add(`${startPoint.key}-${featureType}`);
            
            while (queue.length > 0) {
                const current = queue.shift();
                regionCells.push(current.coords);
                
                // Check all other points for potential neighbors
                for (let j = 0; j < points.length; j++) {
                    const candidate = points[j];
                    if (visited.has(`${candidate.key}-${featureType}`)) continue;
                    
                    // If they're neighbors, add to queue
                    if (areNeighbors(current.coords, candidate.coords)) {
                        visited.add(`${candidate.key}-${featureType}`);
                        queue.push(candidate);
                    }
                }
            }
            
            // Calculate center of this contiguous region
            if (regionCells.length > 0) {
                // Handle special case for features that wrap around the planet
                let sumTheta = 0;
                const phiValues = regionCells.map(([_, phi]) => phi);
                
                // Check if this region wraps around phi=0 and phi=2π
                const wrapsAround = phiValues.some(phi => phi < 0.5) && 
                                    phiValues.some(phi => phi > 2 * Math.PI - 0.5);
                
                // Sum coordinates, handling wraparound if needed
                let sumX = 0, sumY = 0;
                if (wrapsAround) {
                    // Use cartesian averaging for regions that wrap around
                    regionCells.forEach(([theta, phi]) => {
                        sumTheta += theta;
                        // Convert to cartesian coordinates on unit sphere for averaging
                        sumX += Math.sin(theta) * Math.cos(phi);
                        sumY += Math.sin(theta) * Math.sin(phi);
                    });
                    
                    // Convert average cartesian back to spherical
                    const avgX = sumX / regionCells.length;
                    const avgY = sumY / regionCells.length;
                    const avgPhi = Math.atan2(avgY, avgX);
                    const centerTheta = sumTheta / regionCells.length;
                    const centerPhi = normalizePhiCoordinate(avgPhi);
                    
                    contiguousCenters[featureType].push({
                        regionId: regionIndex,
                        center: [centerTheta, centerPhi],
                        cellCount: regionCells.length
                    });
                } else {
                    // Simple averaging for non-wrapping regions
                    let sumPhi = 0;
                    regionCells.forEach(([theta, phi]) => {
                        sumTheta += theta;
                        sumPhi += phi;
                    });
                    
                    const centerTheta = sumTheta / regionCells.length;
                    const centerPhi = sumPhi / regionCells.length;
                    
                    contiguousCenters[featureType].push({
                        regionId: regionIndex,
                        center: [centerTheta, centerPhi],
                        cellCount: regionCells.length
                    });
                }
            }
        }
    }
    
    return { counts: contiguousCounts, centers: contiguousCenters };
}

/**
 * Generate histograms for numerical data
 * @param {Array} values - Array of numerical values
 * @param {number} bins - Number of bins in histogram
 * @returns {Object} - Histogram data
 */
export function generateHistogram(values, bins = 5) {
    if (values.length === 0) return {};
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binSize = (max - min) / bins;
    const histogram = Array(bins).fill(0);
    
    values.forEach(value => {
        const binIndex = Math.min(Math.floor((value - min) / binSize), bins - 1);
        histogram[binIndex]++;
    });
    
    // Format for display
    const formattedHistogram = {};
    for (let i = 0; i < bins; i++) {
        const lowerBound = min + i * binSize;
        const upperBound = min + (i + 1) * binSize;
        formattedHistogram[`${lowerBound.toFixed(2)}-${upperBound.toFixed(2)}`] = histogram[i];
    }
    
    return formattedHistogram;
}

/**
 * Generate a color histogram from color counts
 * @param {Object} colorCounts - Map of color strings to counts
 * @param {number} totalVertices - Total number of vertices
 * @param {number} bins - Number of bins for the histogram
 * @returns {Object} - Color histogram data
 */
export function generateColorHistogram(colorCounts, totalVertices, bins = 5) {
    // Convert colors to brightness values (simple average of RGB)
    const colorData = Object.entries(colorCounts).map(([color, count]) => {
        const [r, g, b] = color.split(',').map(Number);
        const brightness = (r + g + b) / 3;
        return { color, brightness, count };
    });
    
    // Sort by brightness
    colorData.sort((a, b) => a.brightness - b.brightness);
    
    // Create bins based on brightness
    const histBins = {};
    const minBrightness = Math.min(...colorData.map(d => d.brightness));
    const maxBrightness = Math.max(...colorData.map(d => d.brightness));
    const range = maxBrightness - minBrightness;
    const binSize = range / bins || 1;
    
    // Initialize bins
    for (let i = 0; i < bins; i++) {
        const lowerBound = minBrightness + i * binSize;
        const upperBound = minBrightness + (i + 1) * binSize;
        histBins[`${lowerBound.toFixed(1)}-${upperBound.toFixed(1)}`] = 0;
    }
    
    // Fill bins
    colorData.forEach(({ brightness, count }) => {
        const binIndex = Math.min(Math.floor((brightness - minBrightness) / binSize), bins - 1);
        const lowerBound = minBrightness + binIndex * binSize;
        const upperBound = minBrightness + (binIndex + 1) * binSize;
        const key = `${lowerBound.toFixed(1)}-${upperBound.toFixed(1)}`;
        histBins[key] += count;
    });
    
    return histBins;
}

/**
 * Log analytics data
 * @param {Object} analyticsData - The analytics data to log
 */
export function logAnalytics(analyticsData) {
    const totalVertices = Object.values(analyticsData.colorCounts).reduce((sum, count) => sum + count, 0);
    
    // 1. Color distribution as histogram
    console.group("Mesh Color Distribution:");
    console.log("Total vertices:", totalVertices);
    const colorHistogram = generateColorHistogram(analyticsData.colorCounts, totalVertices);
    Object.entries(colorHistogram).forEach(([range, count]) => {
        const percentage = ((count / totalVertices) * 100).toFixed(2);
        console.log(`  Brightness ${range}: ${count} vertices (${percentage}%)`);
    });
    console.groupEnd();
    
    // 2. Feature coverage
    console.group("Feature Coverage:");
    Object.entries(analyticsData.featureCounts).forEach(([feature, count]) => {
        const percentage = ((count / totalVertices) * 100).toFixed(2);
        console.log(`  ${feature}: ${percentage}% of vertices`);
    });
    console.groupEnd();
    
    // 3. Temperature histogram
    if (analyticsData.temperatureValues.length > 0) {
        console.group("Temperature Distribution:");
        const tempHistogram = generateHistogram(analyticsData.temperatureValues);
        Object.entries(tempHistogram).forEach(([range, count]) => {
            const percentage = ((count / analyticsData.temperatureValues.length) * 100).toFixed(2);
            console.log(`  ${range}: ${count} vertices (${percentage}%)`);
        });
        console.groupEnd();
    }
    
    // 4. Height histogram
    console.group("Height Distribution:");
    const heightHistogram = generateHistogram(analyticsData.heightValues);
    Object.entries(heightHistogram).forEach(([range, count]) => {
        const percentage = ((count / analyticsData.heightValues.length) * 100).toFixed(2);
        console.log(`  ${range}: ${count} vertices (${percentage}%)`);
    });
    console.groupEnd();
    
    // 5. Contiguous features with centers
    console.group("Contiguous Features:");
    const contiguousInfo = calculateContiguousFeatures(analyticsData.featureMap);
    Object.entries(contiguousInfo.counts).forEach(([feature, count]) => {
        console.log(`  ${feature}: ${count} contiguous regions`);
        
        // Sort regions by size (largest first)
        const centers = contiguousInfo.centers[feature].sort((a, b) => b.cellCount - a.cellCount);
        
        // Display only top 10 regions to avoid log clutter for features with many tiny regions
        if (centers && centers.length > 0) {
            console.group(`  ${feature} Region Centers (top ${Math.min(5, centers.length)}):`);
            centers.slice(0, Math.min(10, centers.length)).forEach(region => {
                const [theta, phi] = region.center;
                const thetaDeg = (theta * 180 / Math.PI).toFixed(1);
                const phiDeg = (phi * 180 / Math.PI).toFixed(1);
                console.log(`    Region ${region.regionId}: θ=${thetaDeg}°, φ=${phiDeg}° (${region.cellCount} cells)`);
            });
            console.groupEnd();
        }
    });
    console.groupEnd();
}