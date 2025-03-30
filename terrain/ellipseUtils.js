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
            
            // Track feature for contiguity analysis
            const key = `${Math.round(theta * 100)},${Math.round(phi * 100)}`;
            if (!analyticsData.featureMap.has(key)) {
                analyticsData.featureMap.set(key, []);
            }
            analyticsData.featureMap.get(key).push(feature);
        });
    }
}

/**
 * Calculate contiguous regions for each feature type
 * @param {Object} featureMap - Map of coordinates to features
 * @returns {Object} - Map of feature type to contiguous region count
 */
export function calculateContiguousFeatures(featureMap) {
    const visited = new Set();
    const contiguousCounts = {};
    const directions = [
        [0, 1], [1, 0], [0, -1], [-1, 0], // 4-connected
        [1, 1], [-1, -1], [1, -1], [-1, 1] // 8-connected
    ];
    
    const featureTypes = new Set();
    featureMap.forEach(features => {
        features.forEach(feature => featureTypes.add(feature));
    });
    
    for (const featureType of featureTypes) {
        contiguousCounts[featureType] = 0;
        
        for (const [key, features] of featureMap.entries()) {
            if (visited.has(`${key}-${featureType}`) || !features.includes(featureType)) continue;
            
            // Found a new region
            contiguousCounts[featureType]++;
            
            // BFS to find all connected cells with this feature
            const queue = [key];
            visited.add(`${key}-${featureType}`);
            
            while (queue.length > 0) {
                const current = queue.shift();
                const [y, x] = current.split(',').map(Number);
                
                for (const [dy, dx] of directions) {
                    const newKey = `${y + dy},${x + dx}`;
                    if (featureMap.has(newKey) && 
                        featureMap.get(newKey).includes(featureType) && 
                        !visited.has(`${newKey}-${featureType}`)) {
                        visited.add(`${newKey}-${featureType}`);
                        queue.push(newKey);
                    }
                }
            }
        }
    }
    
    return contiguousCounts;
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
 * Log analytics data
 * @param {Object} analyticsData - The analytics data to log
 */
export function logAnalytics(analyticsData) {
    const totalVertices = Object.values(analyticsData.colorCounts).reduce((sum, count) => sum + count, 0);
    
    // 1. Color distribution
    console.group("Mesh Color Distribution:");
    console.log("Total vertices:", totalVertices);
    Object.entries(analyticsData.colorCounts).forEach(([color, count]) => {
        const percentage = ((count / totalVertices) * 100).toFixed(1); // Format percentage
        const formattedColor = color
            .split(',')
            .map(num => parseFloat(num).toFixed(1)) // Format color values
            .join(', ');
        
        console.log(`  Color [${formattedColor}]: ${count} vertices (${percentage}%)`);
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
    
    // 5. Contiguous features
    console.group("Contiguous Features:");
    const contiguousCounts = calculateContiguousFeatures(analyticsData.featureMap);
    Object.entries(contiguousCounts).forEach(([feature, count]) => {
        console.log(`  ${feature}: ${count} contiguous regions`);
    });
    console.groupEnd();
}