// Constants
let pluginParams = PluginManager.parameters("YED_Tiled");

Object.defineProperty(Game_Map.prototype, 'tiledData', {
    get: function () {
        return DataManager._tempTiledData;
    },
    configurable: true
});

Object.defineProperty(Game_Map.prototype, 'currentMapLevel', {
    get: function () {
        let varID = parseInt(pluginParams["Map Level Variable"]);
        if (!varID) {
            return this._currentMapLevel;
        } else {
            return $gameVariables.value(varID);
        }
    },
    set: function (value) {
        let varID = parseInt(pluginParams["Map Level Variable"]);
        if (!varID) {
            this._currentMapLevel = value;
        } else {
            $gameVariables.setValue(varID, value);
        }
    },
    configurable: true
});

let _setup = Game_Map.prototype.setup;
Game_Map.prototype.setup = function (mapId) {
    _setup.call(this, mapId);
    this._collisionMap = {};
    this._arrowCollisionMap = {};
    this._regions = {};
    this._mapLevelChange = {};
    this._positionHeightChange = {};
    this._tileFlags = {};
    this._collisionMapLayers = [];
    this._arrowCollisionMapLayers = [];
    this._regionsLayers = [];
    this._mapLevelChangeLayers = [];
    this._positionHeightChangeLayers = [];
    this._tileFlagsLayers = [];
    this._currentMapLevel = 0;
    this.currentMapLevel = 0;
    if (this.isTiledMap()) {
        $dataMap.width = this.tiledData.width;
        $dataMap.height = this.tiledData.height;
        this._setupTiled();
        this._tiledInitialized = true;
        if(this._refreshList) {
            this._refreshList.forEach(character => {
                character.refreshBushDepth();
            })
        }
    }
};

Game_Map.prototype.isTiledInitialized = function() {
    return !!this._tiledInitialized;
}

Game_Map.prototype.setRefreshDepth = function(character) {
    if(!this._refreshList) {
        this._refreshList = [];
    }
    this._refreshList.push(character);
}

Game_Map.prototype.isTiledMap = function () {
    return !!this.tiledData;
};

Game_Map.prototype._setupTiled = function () {
    this._convertChunks();
    this._initializeMapLevel(0);

    this._setupCollision();
    this._setupRegion();
    this._setupMapLevelChange();
    this._setupTileFlags();
    this._setupTiledEvents();
};

Game_Map.prototype._convertChunks = function() {
    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx];
        if(!layerData.data && !!layerData.chunks) {
            layerData.data = new Array(this.width() * this.height());
            layerData.data.fill(0);
            layerData.chunks.forEach(chunk => {
                for(let i = 0; i < chunk.data.length; i++) {
                    let x = chunk.x + (i % chunk.width);
                    let y = chunk.y + Math.floor(i / chunk.width);
                    if(x >= layerData.x + this.width() || y >= layerData.x + this.width()) {
                        continue;
                    }
                    let realX = x + y * this.width();
                    layerData.data[realX] = chunk.data[i];
                }
            })
        }
    }
}

Game_Map.prototype._initializeMapLevel = function (id) {
    if (!!this._collisionMap[id]) {
        return;
    }

    this._collisionMap[id] = {};
    this._arrowCollisionMap[id] = {};
    this._regions[id] = {};
    this._mapLevelChange[id] = {};
    this._tileFlags[id] = {};
    this._collisionMapLayers[id] = [];
    this._arrowCollisionMapLayers[id] = [];
    this._regionsLayers[id] = [];
    this._mapLevelChangeLayers[id] = [];
    this._tileFlagsLayers[id] = [];
    this._initializeMapLevelData(id);
};

Game_Map.prototype._initializeMapLevelData = function(id = 0, layerId = 'main', dataTypes = false) {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    
    const defaultData = {
        'collisionMap': 0,
        'arrowCollisionMap': 1 | 2 | 4 | 8,
        'regions': 0,
        'mapLevelChange': -1,
        'positionHeightChange': -1,
        'tileFlags': 0
    }

    if(!dataTypes) {
        dataTypes = Object.keys(defaultData);
    }

    for(let idx = 0; idx < dataTypes.length; idx++) {
        let dataType = dataTypes[idx];
        let defaultValue = defaultData[dataType];
        if(!this['_' + dataType][id]) {
            this['_' + dataType][id] = {};
            this['_' + dataType + 'Layers'][id] = [];
        }
        if(!!this['_' + dataType][id][layerId]) {
            continue;
        }
        this['_' + dataType][id][layerId] = []
        let typeData = this['_' + dataType][id][layerId]
        for (let x of Array(size).keys()) {
            typeData.push(defaultValue);
        }
    }
}

Game_Map.prototype._setupCollision = function () {
    this._setupCollisionFull();
    this._setupCollisionArrow();
};

Game_Map.prototype._setupCollisionFull = function () {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    let halfWidth = width / 2;
    let halfHeight = height / 2;

    if (this.isHalfTile()) {
        size /= 4;
    }

    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx]
        if (!layerData.properties || !layerData.properties.collision) {
            continue;
        }

        if (layerData.properties.collision !== "full"
            && layerData.properties.collision !== "up-left"
            && layerData.properties.collision !== "up-right"
            && layerData.properties.collision !== "down-left"
            && layerData.properties.collision !== "down-right"
            && layerData.properties.collision !== "tiles") {
            continue;
        }

        let level = parseInt(layerData.properties.level) || 0;
        this._initializeMapLevel(level);
        
        let layerId = 'main';

        if(TiledManager.hasHideProperties(layerData)) {
            layerId = idx;
            this._collisionMapLayers[level].push(idx);
            this._initializeMapLevelData(level, layerId, ['collisionMap']);
        }
        
        for (let x of Array(size).keys()) {
            let realX = x;
            let ids = [];
            if (this.isHalfTile()) {
                realX = Math.floor(x / halfWidth) * width * 2 + (x % halfWidth) * 2;
            }
            if (!!layerData.data[x]) {
                switch(layerData.properties.collision) {
                    case "full":
                        ids.push(realX);
                        if (this.isHalfTile()) {
                            ids.push(realX + 1, realX + width, realX + width + 1);
                        }
                        break;
                    case "up-left":
                        ids.push(realX);
                        break;
                    case "up-right":
                        ids.push(realX + 1);
                        break;
                    case "down-left":
                        ids.push(realX + width);
                        break;
                    case "down-right":
                        ids.push(realX + width + 1);
                        break;
                    case "tiles":
                        let tileId = layerData.data[x];
                        let tileset = this._getTileset(tileId);
                        if(tileset && tileset.tileproperties) {
                            let tileData = tileset.tileproperties[tileId - tileset.firstgid];
                            if(tileData) {
                                if(tileData.collision) {
                                    ids.push(realX);
                                    if (this.isHalfTile()) {
                                        ids.push(realX + 1, realX + width, realX + width + 1);
                                    }
                                }
                                if(tileData.collisionUpLeft) {
                                    ids.push(realX);
                                }
                                if(tileData.collisionUpRight) {
                                    ids.push(realX + 1);
                                }
                                if(tileData.collisionDownLeft) {
                                    ids.push(realX + width);
                                }
                                if(tileData.collisionDownRight) {
                                    ids.push(realX + width + 1);
                                }
                            }
                        }
                        break;
                }
                for (let id of ids) {
                    this._collisionMap[level][layerId][id] = 1;
                }
            }
        }
    }
};

Game_Map.prototype._setupCollisionArrow = function () {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    let bit = 0;
    let halfWidth = width / 2;
    let halfHeight = height / 2;

    if (this.isHalfTile()) {
        size /= 4;
    }

    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx]
        if (!layerData.properties || !layerData.properties.collision) {
            continue;
        }

        if (layerData.properties.collision !== "arrow" && layerData.properties.collision !== "tiles") {
            continue;
        }

        if (!layerData.properties.arrowImpassable && layerData.properties.collision !== "tiles") {
            continue;
        }
        
        if(layerData.properties.arrowImpassable) {

            if (layerData.properties.arrowImpassable === "down") {
                bit = 1;
            }

            if (layerData.properties.arrowImpassable === "left") {
                bit = 2;
            }

            if (layerData.properties.arrowImpassable === "right") {
                bit = 4;
            }

            if (layerData.properties.arrowImpassable === "up") {
                bit = 8;
            }


        }

        let level = parseInt(layerData.properties.level) || 0;
        this._initializeMapLevel(level);
        
        let layerId = 'main';

        if(TiledManager.hasHideProperties(layerData)) {
            layerId = idx;
            this._arrowCollisionMapLayers[level].push(idx);
            this._initializeMapLevelData(level, layerId, ['arrowCollisionMap']);
        }
        
        let arrowCollisionMap = this._arrowCollisionMap[level][layerId];
        for (let x of Array(size).keys()) {
            let realX = x;
            if (this.isHalfTile()) {
                realX = Math.floor(x / halfWidth) * width * 2 + (x % halfWidth) * 2;
            }

            if (!!layerData.data[x]) {
                let realBit = bit;
                if(layerData.properties.collision === "tiles") {
                    realBit = 0;
                    let tileId = layerData.data[x];
                    let tileset = this._getTileset(tileId);
                    if(tileset && tileset.tileproperties) {
                        let tileData = tileset.tileproperties[tileId - tileset.firstgid];
                        if(tileData) {
                            if(tileData.arrowImpassableDown) {
                                realBit+= 1;
                            }
                            if(tileData.arrowImpassableLeft) {
                                realBit+= 2;
                            }
                            if(tileData.arrowImpassableRight) {
                                realBit+= 4;
                            }
                            if(tileData.arrowImpassableUp) {
                                realBit+= 8;
                            }
                        }
                    }
                }
                arrowCollisionMap[realX] = arrowCollisionMap[realX] ^ realBit;
                if (this.isHalfTile()) {
                    arrowCollisionMap[realX + 1]
                        = arrowCollisionMap[realX + 1] ^ realBit;
                    arrowCollisionMap[realX + width]
                        = arrowCollisionMap[realX + width] ^ realBit;
                    arrowCollisionMap[realX + width + 1]
                        = arrowCollisionMap[realX + width + 1] ^ realBit;
                }
            }
        }
    }
};

Game_Map.prototype._setupRegion = function () {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    let halfWidth = width / 2;
    let halfHeight = height / 2;

    if (this.isHalfTile()) {
        size /= 4;
    }

    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx]
        if (!layerData.properties || !layerData.properties.regionId) {
            continue;
        }

        let level = parseInt(layerData.properties.level) || 0;
        this._initializeMapLevel(level);
        
        let layerId = 'main';

        if(TiledManager.hasHideProperties(layerData)) {
            layerId = idx;
            this._regionsLayers[level].push(idx);
            this._initializeMapLevelData(level, layerId, ['regions']);
        }
        
        let regionMap = this._regions[level][layerId];

        for (let x of Array(size).keys()) {
            let realX = x;
            if (this.isHalfTile()) {
                realX = Math.floor(x / halfWidth) * width * 2 + (x % halfWidth) * 2;
            }

            if (!!layerData.data[x]) {
                let regionId = 0;
                if(layerData.properties.regionId > -1) {
                    regionId = parseInt(layerData.properties.regionId);
                } else {
                    let tileId = layerData.data[x];
                    let tileset = this._getTileset(tileId);
                    if(tileset && tileset.tileproperties) {
                        let tileData = tileset.tileproperties[tileId - tileset.firstgid];
                        if(tileData && tileData.regionId) {
                            regionId = parseInt(tileData.regionId);
                        }
                    }
                    if(layerData.properties.regionOffset) {
                        regionId+= layerData.properties.regionOffset;
                    }
                }
                regionMap[realX] = regionId;
                if (this.isHalfTile()) {
                    regionMap[realX + 1] = regionId;
                    regionMap[realX + width] = regionId;
                    regionMap[realX + width + 1] = regionId;
                }
            }
        }
    }
};

Game_Map.prototype._setupMapLevelChange = function () {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    let halfWidth = width / 2;
    let halfHeight = height / 2;

    if (this.isHalfTile()) {
        size /= 4;
    }

    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx]
        if (!layerData.properties || !layerData.properties.hasOwnProperty('toLevel')) {
            continue;
        }

        let level = parseInt(layerData.properties.level) || 0;
        this._initializeMapLevel(level);
        let layerId = 'main';

        if(TiledManager.hasHideProperties(layerData)) {
            layerId = idx;
            this._mapLevelChangeLayers[level].push(idx);
            this._initializeMapLevelData(level, layerId, ['mapLevelChange']);
        }
        
        let levelChangeMap = this._mapLevelChange[level][layerId];

        for (let x of Array(size).keys()) {
            let realX = x;
            let toLevel = parseInt(layerData.properties.toLevel);
            if (this.isHalfTile()) {
                realX = Math.floor(x / halfWidth) * width * 2 + (x % halfWidth) * 2;
            }

            if (!!layerData.data[x]) {
                levelChangeMap[realX] = toLevel;
                if (this.isHalfTile()) {
                    levelChangeMap[realX + 1] = toLevel;
                    levelChangeMap[realX + width] = toLevel;
                    levelChangeMap[realX + width + 1] = toLevel;
                }
            }
        }
    }
};

Game_Map.prototype._setupPositionHeightChange = function () {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    let halfWidth = width / 2;
    let halfHeight = height / 2;

    if (this.isHalfTile()) {
        size /= 4;
    }

    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx]
        if (!layerData.properties || !layerData.properties.hasOwnProperty('floorHeight')) {
            continue;
        }

        let level = parseInt(layerData.properties.level) || 0;
        this._initializeMapLevel(level);
        let layerId = 'main';

        if(TiledManager.hasHideProperties(layerData)) {
            layerId = idx;
            this._positionHeightChangeLayers[level].push(idx);
            this._initializeMapLevelData(level, layerId, ['positionHeightChange']);
        }
        
        let positionHeightChangeMap = this._positionHeightChange[level][layerId];

        for (let x of Array(size).keys()) {
            let realX = x;
            let toLevel = parseInt(layerData.properties.floorHeight);
            if (this.isHalfTile()) {
                realX = Math.floor(x / halfWidth) * width * 2 + (x % halfWidth) * 2;
            }

            if (!!layerData.data[x]) {
                positionHeightChangeMap[realX] = toLevel;
                if (this.isHalfTile()) {
                    positionHeightChangeMap[realX + 1] = toLevel;
                    positionHeightChangeMap[realX + width] = toLevel;
                    positionHeightChangeMap[realX + width + 1] = toLevel;
                }
            }
        }
    }
};

Game_Map.prototype._setupTileFlags = function() {
    let width = this.width();
    let height = this.height();
    let size = width * height;
    let halfWidth = width / 2;
    let halfHeight = height / 2;

    if (this.isHalfTile()) {
        size /= 4;
    }
    
    for (let idx = 0; idx < this.tiledData.layers.length; idx++) {
        let layerData = this.tiledData.layers[idx]
        if (!layerData.properties || !layerData.properties.tileFlags) {
            continue;
        }

        let level = parseInt(layerData.properties.level) || 0;
        this._initializeMapLevel(level);
        
        let layerId = 'main';

        if(TiledManager.hasHideProperties(layerData)) {
            layerId = idx;
            this._tileFlagsLayers[level].push(idx);
            this._initializeMapLevelData(level, layerId, ['tileFlags']);
        }
        
        let tileFlagMap = this._tileFlags[level][layerId];

        for (let x of Array(size).keys()) {
            let realX = x;
            if (this.isHalfTile()) {
                realX = Math.floor(x / halfWidth) * width * 2 + (x % halfWidth) * 2;
            }

            if (!!layerData.data[x]) {
                let tileFlags = 0;
                let tileId = layerData.data[x];
                let tileset = this._getTileset(tileId);
                if(tileset && tileset.tileproperties) {
                    let tileData = tileset.tileproperties[tileId - tileset.firstgid];
                    if(tileData) {
                        tileFlags = this._getTileFlags(tileData);
                    }
                }
                tileFlagMap[realX] = this._combineFlags(tileFlagMap[realX], tileFlags);
                if (this.isHalfTile()) {
                    tileFlagMap[realX + 1] = this._combineFlags(tileFlagMap[realX + 1], tileFlags);
                    tileFlagMap[realX + width] = this._combineFlags(tileFlagMap[realX + width], tileFlags);
                    tileFlagMap[realX + width + 1] = this._combineFlags(tileFlagMap[realX + width + 1], tileFlags);
                }
            }
        }
    }
}

Game_Map.prototype._getTileFlags = function(tileData) {
    let flags = []
    let flagNames = TiledManager.getFlagNames()
    flagNames.forEach(prop => {
        let property = 'flagIs' + prop.slice(0, 1).toUpperCase() + prop.slice(1)
        if(tileData[property]) {
            let [group, bit] = TiledManager.getFlagLocation(prop)
            for(let i = flags.length; i <= group; i++) {
                flags.push(0)
            }
            flags[group]|= bit
        }
    })
    return flags.length > 0 ? flags : 0
}

Game_Map.prototype._combineFlags = function (source, target) {
    source = source ? source.slice(0) : []
    for(let i = 0; i < target.length; i++) {
        if(!source.length <= i) {
            source.push(i)
        }
        source[i]|= target[i];
    }
    return source;
}

Game_Map.prototype._setupTiledEvents = function () {
    for (let layerData of this.tiledData.layers) {
        if (layerData.type !== "objectgroup") {
            continue;
        }

        for (let object of layerData.objects) {
            if (!object.properties) {
                continue;
            }

            if (!object.properties.eventId && !object.properties.vehicle) {
                continue;
            }

            let event;

            if(!!object.properties.vehicle) {
                event = this.vehicle(object.properties.vehicle);
            } else {
                let eventId = parseInt(object.properties.eventId);
                event = this._events[eventId];
            }
            if (!event) {
                continue;
            }
            let x = object.x / this.tileWidth();
            let y = object.y / this.tileHeight();
            if(pluginParams["Constrain Events to Grid"].toLowerCase() === "true") {
                x = Math.floor(x);
                y = Math.floor(y);
            }
            if (this.isHalfTile()) {
                x += 1;
                y += 1;
            }
            if(!!object.properties.vehicle) {
                event.setLocation(this.mapId(), x, y);
            } else {
                event.locate(x, y);
            }
			event._tiledProperties = object.properties;
        }
    }
};

Game_Map.prototype.isHalfTile = function () {
    return pluginParams["Half-tile movement"].toLowerCase() === "true";
};

Game_Map.prototype._getTileset = function(tileId) {
    for(let idx = 0; idx < this.tiledData.tilesets.length; idx++) {
        let tileset = this.tiledData.tilesets[idx];
        if(tileId >= tileset.firstgid && tileId < tileset.firstgid + tileset.tilecount) {
            return tileset;
        }
    }
    return null;
};

Game_Map.prototype.tileWidth = function () {
    let tileWidth = this.tiledData.tilewidth;
    if (this.isHalfTile()) {
        tileWidth /= 2;
    }
    return tileWidth;
};

Game_Map.prototype.tileHeight = function () {
    let tileHeight = this.tiledData.tileheight;
    if (this.isHalfTile()) {
        tileHeight /= 2;
    }
    return tileHeight;
};

Game_Map.prototype.width = function () {
    let width = this.tiledData.width;
    if (this.isHalfTile()) {
        width *= 2;
    }
    return width;
};

Game_Map.prototype.height = function () {
    let height = this.tiledData.height;
    if (this.isHalfTile()) {
        height *= 2;
    }
    return height;
};

let _regionId = Game_Map.prototype.regionId;
Game_Map.prototype.regionId = function (x, y, allIds = false) {
    if (!this.isTiledMap()) {
        return _regionId.call(this, x, y);
    }

    let index = x + this.width() * y;
    let regionMap = this._regions[this.currentMapLevel];
    let regionLayer = this._regionsLayers[this.currentMapLevel];
    
    let regionValue = regionMap.main[index];
    let regionValues = [regionValue];

    if(regionLayer && regionLayer.length > 0) {
        for(let idx = 0; idx < regionLayer.length; idx++) {
            let layerId = regionLayer[idx];
            let layerData = this.tiledData.layers[layerId];
            let hideData = TiledManager.checkLayerHidden(layerData, 'regions');
            if(!hideData) {
                if(allIds) {
                    regionValues.push(regionMap[layerId][index]);
                } else {
                    regionValue = regionMap[layerId][index];
                }
            }
        }
    }

    return allIds ? regionValues : regionValue;
};

Game_Map.prototype.regionIds = function (x, y) {
    return this.regionId(x, y, true);
}

let _checkPassage = Game_Map.prototype.checkPassage;
Game_Map.prototype.checkPassage = function (x, y, bit, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _checkPassage.call(this, x, y, d);
    }
    if(level === false) {
        level = this._currentMapLevel;
    }
    let index = x + this.width() * y;
    let arrows = this._arrowCollisionMap[level];
    let arrowLayer = this._arrowCollisionMapLayers[level];
    let arrowValue = arrows.main[index];
    
    if(render && arrows[render]) {
        arrowValue = arrows[render][index];
    } else if(arrowLayer && arrowLayer.length > 0) {
        for(let idx = 0; idx < arrowLayer.length; idx++) {
            let layerId = arrowLayer[idx];
            let layerData = this.tiledData.layers[layerId];
            let hideData = TiledManager.checkLayerHidden(layerData, 'collisions');
            if(!hideData) {
                arrowValue&= arrows[layerId][index];
            }
        }
    }

    return (arrowValue & bit) > 0
}

Game_Map.prototype.renderPassage = function (x, y, bit, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    if(render && !this._arrowCollisionMap[level][render]) {
        render = 'main';
    }
    return this.checkPassage(x, y, bit, render, level);
}

Game_Map.prototype.getPassageLayers = function(level) {
    return this._arrowCollisionMapLayers[level].slice(0);
}

let _isPassable = Game_Map.prototype.isPassable;
Game_Map.prototype.isPassable = function (x, y, d, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isPassable.call(this, x, y, d);
    }
    if(level === false) {
        level = this._currentMapLevel;
    }

    if(!this.checkPassage(x, y, (1 << (d / 2 - 1)) & 0x0f, render)) {
        return false;
    }
    
    let index = x + this.width() * y;
    let collisionMap = this._collisionMap[level];
    let collisionLayer = this._collisionMapLayers[level];
    let collisionValue = collisionMap.main[index]
    
    if(render && collisionMap[render]) {
        collisionValue = collisionMap[render][index];
    } else if(collisionLayer && collisionLayer.length > 0) {
        for(let idx = 0; idx < collisionLayer.length; idx++) {
            let layerId = collisionLayer[idx];
            let layerData = this.tiledData.layers[layerId];
            let hideData = TiledManager.checkLayerHidden(layerData, 'collisions');
            if(!hideData) {
                collisionValue|= collisionMap[layerId][index];
            }
        }
    }

    return collisionValue === 0;
};

Game_Map.prototype.renderIsPassable = function (x, y, d, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    if(render && !this._collisionMap[level][render]) {
        render = 'main';
    }
    return this.isPassable(x, y, d, render, level);
}

Game_Map.prototype.getIsPassableLayers = function(level) {
    return this._collisionMapLayers[level].slice(0);
}

Game_Map.prototype.checkMapLevelChanging = function (x, y) {
    let mapLevelChange = this._mapLevelChange[this.currentMapLevel];
    let mapLevelChangeLayer = this._mapLevelChangeLayers[this.currentMapLevel];
    let index = y * this.width() + x;
    let mapLevelChangeValue = mapLevelChange.main[index]
    if(mapLevelChangeLayer.length > 0) {
        for(let idx = 0; idx < mapLevelChangeLayer.length; idx++) {
            let layerId = mapLevelChangeLayer[idx];
            let layerData = this.tiledData.layers[layerId];
            let hideData = TiledManager.checkLayerHidden(layerData, 'levelChanges');
            if(!hideData) {
                mapLevelChangeValue = mapLevelChange[layerId][index];
            }
        }
    }
    if (mapLevelChangeValue < 0) {
        return false;
    }
    this.currentMapLevel = mapLevelChangeValue;
    return true;
};

Game_Map.prototype.checkPositionHeight = function (x, y) {
    let positionHeightChange = this._positionHeightChange[this.currentMapLevel];
    let positionHeightChangeLayer = this._positionHeightChangeLayers[this.currentMapLevel];
    let index = y * this.width() + x;
    let positionHeightChangeValue = positionHeightChange.main[index]
    if(positionHeightChangeLayer.length > 0) {
        for(let idx = 0; idx < positionHeightChangeLayer.length; idx++) {
            let layerId = positionHeightChangeLayer[idx];
            let layerData = this.tiledData.layers[layerId];
            let hideData = TiledManager.checkLayerHidden(layerData, 'positionHeightChanges');
            if(!hideData) {
                positionHeightChangeValue = positionHeightChange[layerId][index];
            }
        }
    }
    return positionHeightChangeValue;
};

Game_Map.prototype.getTileFlags = function (x, y, render = false, level = false) {
    if(level === false) {
        level = 0;
    }
    let index = x + this.width() * y;
    let tileFlags = this._tileFlags[level];
    let tileFlagsLayer = this._tileFlagsLayers[level];
    let tileFlagsValue = (tileFlags.main[index] ? tileFlags.main[index].slice(0) : []);

    if(render && tileFlags[render]) {
        tileFlagsValue = (tileFlags[render][index] ? tileFlags[render][index].slice(0) : []);
    } else if(tileFlagsLayer && tileFlagsLayer.length > 0) {
        for(let idx = 0; idx < tileFlagsLayer.length; idx++) {
            let layerId = tileFlagsLayer[idx];
            let layerData = this.tiledData.layers[layerId];
            let hideData = TiledManager.checkLayerHidden(layerData, 'tileFlags');
            if(!hideData && tileFlags[layerId][index]) {
                tileFlagsValue = this._combineFlags(tileFlagsValue, tileFlags[layerId][index])
            }
        }
    }
    return tileFlagsValue
}

Game_Map.prototype.renderTileFlags = function (x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    if(render && !this._tileFlags[level][render]) {
        render = 'main';
    }
    return this.getTileFlags(x, y, render, level);
}

Game_Map.prototype.checkHasTileFlag = function (x, y, flag, render = false, level = false) {
    if(level === false) {
        level = 0;
    }
    if(typeof flag === 'string') {
        flag = TiledManager.getFlag(flag)
    }
    let bit = (1 << (flag % 16)) & 0xffff;
    let group = Math.floor(flag / 16);
    let tileFlagsValue = this.getTileFlags(x, y, render, level);
    
    return (tileFlagsValue[group] & bit) > 0
}

Game_Map.prototype.renderHasTileFlag = function (x, y, flag, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    if(render && !this._tileFlags[level][render]) {
        render = 'main';
    }
    return this.checkHasTileFlag(x, y, flag, render, level);
}

let _isBoatPassable = Game_Map.prototype.isBoatPassable
Game_Map.prototype.isBoatPassable = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isBoatPassable.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.checkHasTileFlag(x, y, 'boat', render, level);
};

Game_Map.prototype.renderIsBoatPassable = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isBoatPassable(x, y, render, level);
}

let _isShipPassable = Game_Map.prototype.isShipPassable
Game_Map.prototype.isShipPassable = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isShipPassable.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.checkHasTileFlag(x, y, 'ship', render);
};

Game_Map.prototype.renderIsShipPassable = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isShipPassable(x, y, render, level);
}

let _isAirshipLandOk = Game_Map.prototype.isAirshipLandOk
Game_Map.prototype.isAirshipLandOk = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isAirshipLandOk.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.checkHasTileFlag(x, y, 'airship', render) && this.checkPassage(x, y, 0x0f, render);
};

Game_Map.prototype.renderIsAirshipLandOk = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isAirshipLandOk(x, y, render, level);
}

let _isLadder = Game_Map.prototype.isLadder
Game_Map.prototype.isLadder = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isLadder.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.isValid(x, y) && this.checkHasTileFlag(x, y, 'ladder', render);
};

Game_Map.prototype.renderIsLadder = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isLadder(x, y, render, level);
}

let _isBush = Game_Map.prototype.isBush
Game_Map.prototype.isBush = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isBush.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.isValid(x, y) && this.checkHasTileFlag(x, y, 'bush', render);
};

Game_Map.prototype.renderIsBush = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isBush(x, y, render, level);
}

let _isCounter = Game_Map.prototype.isCounter
Game_Map.prototype.isCounter = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isCounter.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.isValid(x, y) && this.checkHasTileFlag(x, y, 'counter', render);
};

Game_Map.prototype.renderIsCounter = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isCounter(x, y, render, level);
}

let _isDamageFloor = Game_Map.prototype.isDamageFloor
Game_Map.prototype.isDamageFloor = function(x, y, render = false, level = false) {
    if (!this.isTiledMap()) {
        return _isDamageFloor.call(this, x, y);
    }
    if(level === false) {
        level = 0;
    }
    return this.isValid(x, y) && this.checkHasTileFlag(x, y, 'damage', render);
};

Game_Map.prototype.renderIsDamageFloor = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isDamageFloor(x, y, render, level);
}

Game_Map.prototype.isSlipperyFloor = function(x, y, render = false, level = false) {
    if(level === false) {
        level = 0;
    }
    return this.isValid(x, y) && this.checkHasTileFlag(x, y, 'ice', render);
};

Game_Map.prototype.renderIsSlipperyFloor = function(x, y, render = 'main', level = 0) {
    if(level === false) {
        level = 0;
    }
    return this.isSlipperyFloor(x, y, render, level);
}

let _isHealFloor = Game_Map.prototype.isHealFloor
Game_Map.prototype.isHealFloor = function(x, y, render = false, level = false) {
    if(level === false) {
        level = 0;
    }
    return this.isValid(x, y) && this.checkHasTileFlag(x, y, 'heal', render);
};

Game_Map.prototype.getLayerProperties = function(layer = -1, ignoreHidden = true) {
	if(layer > -1) {
		if(this.tiledData.layers[layer] && this.tiledData.layers[layer].properties) {
			return Object.assign({}, this.tiledData.layers[layer].properties);
		}
		return {};
	}
	let layerProperties = {};
	this.tiledData.layers.forEach((layerData, i) => {
		if(layerData && layerData.properties) {
            if(!ignoreHidden || !TiledManager.checkLayerHidden(layerData, 'collisions')) {
                layerProperties[i] = Object.assign({}, layerData.properties);
            }
		}
	});
	return layerProperties;
}

Game_Map.prototype.getTileProperties = function(x, y, layer = -1, ignoreHidden = true) {
    let index = x + this.width() * y;
    
	if(layer > -1) {
		if(this.tiledData.layers[layer]) {
			let tileId = this.tiledData.layers[layer].data[x];
			let tileset = this._getTileset(tileId);
			if(tileset && tileset.tileproperties) {
				return Object.assign({}, tileset.tileproperties[tileId - tileset.firstgid]);
			}
		}
		return {};
	}
	let tileProperties = {};
	this.tiledData.layers.forEach((layerData, i) => {
		if(layerData && layerData.properties) {
            if(!ignoreHidden || !TiledManager.checkLayerHidden(layerData)) {
                let props = this.getTileProperties(x, y, i);
                if(Object.keys(props).length > 0) {
                    tileProperties[i] = props;
                }
            }
		}
	});
	return tileProperties;
}