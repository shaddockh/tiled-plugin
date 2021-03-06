let pluginParams = PluginManager.parameters("YED_Tiled");

Game_CharacterBase.prototype.screenZ = function () {
    if (this._priorityType == 0) {
        return parseInt(pluginParams["Z - Below Player"]);
    }
    if (this._priorityType == 2) {
        return parseInt(pluginParams["Z - Above Player"]);
    }
    return parseInt(pluginParams["Z - Player"]);
};

let _distancePerFrame = Game_CharacterBase.prototype.distancePerFrame;
Game_CharacterBase.prototype.distancePerFrame = function () {
    let distance = _distancePerFrame.call(this);
    return distance * (48 / Math.min($gameMap.tileWidth(), $gameMap.tileHeight()));
};

let _refreshBushDepth = Game_CharacterBase.prototype.refreshBushDepth;
Game_CharacterBase.prototype.refreshBushDepth = function() {
    if(!this.hasOwnProperty('_bushDepth')) {
        this._bushDepth = 0;
    }
    if(!$gameMap.isTiledMap() || $gameMap.isTiledInitialized()) {
        _refreshBushDepth.call(this);
    } else {
        $gameMap.setRefreshDepth(this);
    }
};

let _updateMove = Game_CharacterBase.prototype.updateMove;
Game_CharacterBase.prototype.updateMove = function() {
    var hori = (this._realX > this._x ? 4 : (this._realX < this._x ? 6 : 0))
    var vert = (this._realY > this._y ? 8 : (this._realY < this._y ? 2 : 0))
    var d = hori + vert
    _updateMove.call(this);
    if(!this.isMoving() || pluginParams["Position Height - Always Check On Move Update"].toLowerCase() === "true") {
        let newLocationHeight = $gameMap.checkPositionHeight(this._x, this._y);
        if(newLocationHeight > -1) {
            this._locationHeight = newLocationHeight;
        }
    }
    if(!this.isMoving()) {
        TiledManager.triggerListener(this, 'stopmovement', {
            direction: d
        })
        if($gameMap.isSlipperyFloor(this._x, this._y)) {
            TiledManager.triggerListener(this, 'slipperyfloor', {
                direction: d
            })
        }
    }
}

Game_CharacterBase.prototype.locationHeight = function() {
	return this._locationHeight || 0
}

let _isCollideWithVehicles = Game_CharacterBase.prototype.isCollidedWithVehicles
Game_CharacterBase.prototype.isCollidedWithVehicles = function(x, y) {
    if(!_isCollideWithVehicles.call(this, x, y)) {
        let vehicles = $gameMap.vehicles();
        for(let i = 0; i < vehicles.length; i++) {
            if(!(vehicles[i].vehicleData && (!vehicles[i].vehicleData.hasOwnProperty('hasCollision') || vehicles[i].vehicleData.hasCollision === 'true' || vehicles[i].vehicleData.hasCollision === true)) || vehicles[i].posNt(x, y)) {
                return true;
            }
        }
        return false;
    }
    return true;
};

Game_CharacterBase.prototype.updateScroll = function(lastScrolledX, lastScrolledY) {
    var x1 = lastScrolledX;
    var y1 = lastScrolledY;
    var x2 = this.scrolledX();
    var y2 = this.scrolledY();
    if (y2 > y1 && y2 > this.centerY()) {
        $gameMap.scrollDown(y2 - y1);
    }
    if (x2 < x1 && x2 < this.centerX()) {
        $gameMap.scrollLeft(x1 - x2);
    }
    if (x2 > x1 && x2 > this.centerX()) {
        $gameMap.scrollRight(x2 - x1);
    }
    if (y2 < y1 && y2 < this.centerY()) {
        $gameMap.scrollUp(y1 - y2);
    }
};
