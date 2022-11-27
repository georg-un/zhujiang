// TODO: should change the sorting according to the direction we are coming from
// TODO: when moved for the first time, it should jump to 0:50 or 50:100
// TODO: at the right side of the screen, one pixel is not used


var Yanjing = {};

/**
 * Margin of Error in PX for centering a client. If client's center is within
 * this PX of workspace center, consider the client centered.
 */
Yanjing.CENTER_MOE = 2;

Yanjing.MARGIN_OF_ERROR = 1;

Yanjing.States = {
  NOOP: 'NOOP',
  DONE: 'DONE',
  ERROR: 'ERROR',
};

/**
 * @param {string} sizesStringList comma separated
 * @return {number[]} No zero/falsies
 */
Yanjing.sanitizeSizes = function (sizesStringList) {
  return (sizesStringList
    .split(',')
    .map(function ensureFloat(v) {
      return parseFloat(v); // also serves to trim()
    })
    .filter(Boolean) // remove 0 and NaN
  );
}

var DEFAULT_SIZES = '66.6666,50,33.3333';
var DEFAULT_WIDTH_ON_FIRST_MOVE = '50';

var configSizes = [];
var configSizesString = '';
var widthOnFirstMove;
try {
  var configSizesString = readConfig('sizes', '').toString();
  configSizes = Yanjing.sanitizeSizes(configSizesString);
  widthOnFirstMove = parseFloat(readConfig('widthOnFirstMove', '').toString());
} catch (err) {
  print(err);
}

if (configSizes.length > 0) {
  Yanjing.Sizes = configSizes;
  print('Using custom sizes', configSizesString);
} else {
  Yanjing.Sizes = Yanjing.sanitizeSizes(DEFAULT_SIZES);
  print('Using DEFAULT_SIZES', DEFAULT_SIZES);
}

Yanjing.widthOnFirstMove = widthOnFirstMove ? widthOnFirstMove : DEFAULT_WIDTH_ON_FIRST_MOVE;

Yanjing.Dirs = {
  Left: 'Left',
  Center: 'Center',
  Right: 'Right',
};

/**
 * @return {QRect}
 */
Yanjing.getWorkAreaRect = function () {
  return workspace.clientArea(
    KWin.MaximizeArea,
    workspace.activeScreen,
    workspace.currentDesktop
  );
};

/**
 * @param {QRect} rect
 * @return {number}
 */
Yanjing.getRightEdge = function (rect) {
  return rect.x + rect.width;
};

/**
 * @param {number} begin e.g. 33.33
 * @param {number} end e.g. 1
 * @param {number} workAreaMinX e.g. 0
 * @param {number} workAreaMaxX e.g. 1024
 * @param {number} workAreaWidth e.g. 1024
 * @return {number[]} width e.g. [338, 1024]
 */
Yanjing.sizeToLeftAndRightEdge = function (begin, end, workAreaMinX, workAreaMaxX, workAreaWidth) {
	var workAreaWidth = workAreaMaxX - workAreaMinX;
	return [
		Math.round((begin / 100) * workAreaWidth + workAreaMinX),
		Math.round((end / 100) * workAreaWidth + workAreaMinX)
	];
}

Yanjing.buildSizes = function () {
	Yanjing.sizeArray = [];
	var workArea = Yanjing.getWorkAreaRect();
	var minX = workArea.left;
	var maxX = workArea.right;
	var width = workArea.width;
	Yanjing.Sizes.forEach(size => {
		Yanjing.sizeArray.push(Yanjing.sizeToLeftAndRightEdge(0, size, minX, maxX, width));
		Yanjing.sizeArray.push(Yanjing.sizeToLeftAndRightEdge(size, 100, minX, maxX, width));
		// add size combinations
		if (size !== 50) {
			var otherSizes = Yanjing.Sizes.filter(s => s > size && s !== 50).sort();
			otherSizes.forEach(otherSize => {
				Yanjing.sizeArray.push(Yanjing.sizeToLeftAndRightEdge(size, otherSize, minX, maxX, width));
			});
		}
	});
	Yanjing.sizeArray.push(Yanjing.sizeToLeftAndRightEdge(0, 100, minX, maxX, width));
	Yanjing.sizeArray.sort((a, b) => {
		if (a[0] > b[0]) return 1;
		if (a[0] < b[0]) return -1;
		if (a[0] === b[0]) {
			if (a[1] > b[1]) return 1;
			if (a[1] < b[1]) return -1;
			return 0;
		}
	});
}

/**
 * @param {KWin::AbstractClient} client
 * @return {number} index e.g. -1
 */
Yanjing.getCurrentSizeIndex = function (client) {
	var xMin = client.geometry.left;
	var xMax = client.geometry.right;
	return Yanjing.sizeArray.findIndex(size => Math.abs(xMin - size[0]) <= Yanjing.MARGIN_OF_ERROR && Math.abs(xMax - size[1]) <= Yanjing.MARGIN_OF_ERROR);
}

Yanjing.isFirstMove = function (client) {
	return Yanjing.getCurrentSizeIndex(client) === -1;
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 * @return {number} next index e.g. 0
 */
Yanjing.getNextSizeIndex = function (client, shouldDecrease) {
	var currentSizeIdx = Yanjing.getCurrentSizeIndex(client);
	var maxPossibleIdx = Yanjing.sizeArray.length - 1;
	if (currentSizeIdx === -1) {
		return shouldDecrease ? 0 : maxPossibleIdx;
	}
	return shouldDecrease ? Math.max(currentSizeIdx - 1, 0) : Math.min(currentSizeIdx + 1, maxPossibleIdx);
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 * @return {number} next size e.g. [0, 512]
 */
Yanjing.getNextSize = function (client, shouldDecrease) {
	return Yanjing.sizeArray[Yanjing.getNextSizeIndex(client, shouldDecrease)];
}

Yanjing.getNextSizeForFirstMove = function (toLeft) {
	var workArea = Yanjing.getWorkAreaRect();
	var minX = workArea.left;
	var maxX = workArea.right;
	var width = workArea.width;
	return toLeft ?
		Yanjing.sizeToLeftAndRightEdge(0, Yanjing.widthOnFirstMove, minX, maxX, width) :
		Yanjing.sizeToLeftAndRightEdge(Yanjing.widthOnFirstMove, 100, minX, maxX, width);
}

Yanjing.setNextSize = function (client, shouldDecrease) {
	if (Yanjing.beforeMove(client) === Yanjing.States.ERROR) {
		return Yanjing.States.ERROR;
	}
	var nextSize = Yanjing.isFirstMove(client) ?
		Yanjing.getNextSizeForFirstMove(shouldDecrease) :
		Yanjing.getNextSize(client, shouldDecrease);

	var rect = client.geometry;
	rect.x = nextSize[0];
	rect.width = nextSize[1] - nextSize[0];
	rect.right = rect.x + rect.width;
	return Yanjing.States.DONE;
}


/**
 * @param {number} size e.g. 33.3333
 * @return {number} width e.g. 359.9
 */
Yanjing.sizeToWidth = function (size) {
  return size / 100 * Yanjing.getWorkAreaRect().width;
};

/**
 * @param {number} clientWidth of client e.g. 359.9
 * @return {number} index in Sizes array. The size is the nearest size to the
 * client width in relation to the workspace width.
 */
Yanjing.widthToSizeIndex = function (clientWidth) {
  // E.g. if window is 650px and screen is 1080 we'd get 33
  var intWidthPercent = Math.round(clientWidth / Yanjing.getWorkAreaRect().width * 100);

  var smallestDiff = 9999;
  var smallestI = 0;
  Yanjing.Sizes.forEach(function (size, i) {
    var diff = Math.abs(intWidthPercent - size);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      smallestI = i;
    }
  });
  return smallestI;
};

/**
 * @param {number} i index in Sizes
 * @return {number} valid index in Sizes
 */
Yanjing.getNextI = function (i) {
  return i >= Yanjing.Sizes.length - 1 ? 0 : i + 1;
};

/**
 * @param {number} clientWidth like 500 (px)
 * @return {number} width like 333 (px)
 */
Yanjing.getNextWidth = function (clientWidth) {
  // e.g. 2 is 50, meaning the client is roughly 50% of the workspace width
  var sizeI = Yanjing.widthToSizeIndex(clientWidth);
  var nextI = Yanjing.getNextI(sizeI); // would go left 1 or center/right to 3
  var nextSize = Yanjing.Sizes[nextI]; // 33.3333 or 66.6666
  var nextWidth = Yanjing.sizeToWidth(nextSize); // whatever px value, e.g. 359.9
  return parseInt(nextWidth, 10);
};

Yanjing.AfterCycle = {};
Yanjing.AfterCycle[Yanjing.Dirs.Left] = function afterCycleLeft(client) {
  return Yanjing.States.DONE;
};
Yanjing.AfterCycle[Yanjing.Dirs.Center] = function afterCycleCenter(client) {
  return Yanjing.Move[Yanjing.Dirs.Center](client);
};
Yanjing.AfterCycle[Yanjing.Dirs.Right] = function afterCycleRight(client) {
  return Yanjing.Move[Yanjing.Dirs.Right](client);
};

/**
 * @param {KWin::AbstractClient} client
 * @param {string} dir 'Left'
 * @return {string} Yanjing.States value
 */
Yanjing.cycle = function (client, dir) {
  if (!client.resizeable) {
    return Yanjing.States.ERROR;
  }

  var rect = client.geometry; // { width, height, x, y }
  var clientWidth = rect.width; // 500
  var nextWidth = Yanjing.getNextWidth(clientWidth);
  rect.width = nextWidth;
  client.geometry = rect;

  // Move again after cycle to fix reposition due to resize
  var after = Yanjing.AfterCycle[dir];
  return after && after(client);
};

/**
 * Unmaximize a window without changing size.
 *
 * @param {KWin::AbstractClient} client
 * @return {KWin::AbstractClient} client
 */
Yanjing.unmax = function (client) {
  // When you unmax a window it reverts geometry to pre max width and height
  if (typeof client.setMaximize === 'function') {
    var VERTICAL = false;
    var HORIZONTAL = false;
    var maxedRect = client.geometry;
    client.setMaximize(VERTICAL, HORIZONTAL);

    // Restore previous maximized size, but now unmaxed so has drop shadows
    // and window borders.
    client.geometry = maxedRect;
  }
  return client;
};

/**
 * @param {KWin::AbstractClient} client
 * @param {function} moveCb called with client
 * @return {string} Yanjing.States value
 */
Yanjing.beforeMove = function (client) {
  if (!client.moveable) {
    return Yanjing.States.ERROR;
  }

  // Horizonatally unmax a client before moving, since you shouldn't be able
  // move a maximized window.
  // setMaximize is documented at https://develop.kde.org/docs/plasma/kwin/api/
  Yanjing.unmax(client);
  return Yanjing.States.DONE;
};

Yanjing.Move = {};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Yanjing.States value
 */
Yanjing.Move[Yanjing.Dirs.Left] = function (client) {
  if (Yanjing.beforeMove(client) === Yanjing.States.ERROR) {
    return Yanjing.States.ERROR;
  }

  var rect = client.geometry;
  var workAreaLeftEdge = Yanjing.getWorkAreaRect().x;
  var isFlushed = rect.x === workAreaLeftEdge;
  if (isFlushed) {
    return Yanjing.States.NOOP;
  }

  var rect = client.geometry;
  rect.x = workAreaLeftEdge;
  client.geometry = rect;
  return Yanjing.States.DONE;
};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Yanjing.States value
 */
Yanjing.Move[Yanjing.Dirs.Right] = function (client) {
  if (Yanjing.beforeMove(client) === Yanjing.States.ERROR) {
    return Yanjing.States.ERROR;
  }

  var rect = client.geometry;
  var clientRightEdge = Yanjing.getRightEdge(rect);

  var workAreaRect = Yanjing.getWorkAreaRect();
  var workAreaRightEdge = Yanjing.getRightEdge(workAreaRect);

  var isFlushed = clientRightEdge === workAreaRightEdge;
  if (isFlushed) {
    return Yanjing.States.NOOP;
  }

  rect.x = workAreaRightEdge - rect.width;
  client.geometry = rect;
  return Yanjing.States.DONE;
};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Yanjing.States value
 */
Yanjing.Move[Yanjing.Dirs.Center] = function (client) {
  if (Yanjing.beforeMove(client) === Yanjing.States.ERROR) {
    return Yanjing.States.ERROR;
  }

  var rect = client.geometry;
  var clientWidth = rect.width;
  var workAreaRect = Yanjing.getWorkAreaRect();
  var workspaceCenterX = (workAreaRect.width / 2) + workAreaRect.x;
  var clientCenterX = rect.x + (clientWidth / 2);
  var isCentered = (
    clientCenterX - Yanjing.CENTER_MOE <= workspaceCenterX &&
    clientCenterX + Yanjing.CENTER_MOE >= workspaceCenterX
  );
  if (isCentered) {
    return Yanjing.States.NOOP;
  }

  var distance = workspaceCenterX - clientCenterX;
  rect.x = rect.x + distance;
  client.geometry = rect;
  return Yanjing.States.DONE;
};

/**
 * @param {KWin::AbstractClient} client
 * @param {string} key
 * @return {string} Yanjing.States value
 */
Yanjing.squish = function (client, key) {
  var dir = Yanjing.Dirs[key];
  var move = Yanjing.Move[key];
  if (!move || !dir) {
    print('Unrecognized command');
    return Yanjing.States.ERROR;
  }

  var result = move(client);
  if (result === Yanjing.States.NOOP || result === Yanjing.States.DONE) {
    return Yanjing.cycle(client, dir);
  }

  print('Failed to move ' + dir);
  return Yanjing.States.ERROR;
};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Yanjing.States value
 */
Yanjing.yMax = function (client) {
  if (!client || !client.resizeable) {
    return Yanjing.States.ERROR;
  }

  // Work area for the active cliint, considers things like docks!
  var workAreaRect = Yanjing.getWorkAreaRect();
  var rect = client.geometry;
  rect.y = workAreaRect.y
  rect.height = workAreaRect.height;
  client.geometry = rect;
  return Yanjing.States.DONE;
};

Yanjing.main = function () {

  registerShortcut(
    'left-ymax',
    'Yanjing: Vertically maximize and flush or cyclic resize window to left edge of screen',
    'ctrl+shift+meta+a',
    function () {
      var client = workspace.activeClient;
      Yanjing.yMax(client);
	  Yanjing.buildSizes();
	  Yanjing.setNextSize(client, true);
    }
  );

  registerShortcut(
    'center-ymax',
    'Yanjing: Vertically maximize and center or cyclic resize window',
    'ctrl+shift+meta+x',
    function () {
      var client = workspace.activeClient;
      Yanjing.yMax(client);
      Yanjing.squish(client, Yanjing.Dirs.Center);
    }
  );

  registerShortcut(
    'right-ymax',
    'Yanjing: Vertically maximize and flush or cyclic resize window to right edge of screen',
    'ctrl+shift+meta+d',
    function () {
      var client = workspace.activeClient;
      Yanjing.yMax(client);
	  Yanjing.buildSizes();
	  Yanjing.setNextSize(client, false);
    }
  );
};

Yanjing.main();

// Expose for testing
try {
  global.Yanjing = Yanjing;
} catch (error) {
  /* noop */
}
