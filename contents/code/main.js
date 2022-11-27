// TODO: should change the sorting according to the direction we are coming from
// TODO: when moved for the first time, it should jump to 0:50 or 50:100
// TODO: at the right side of the screen, one pixel is not used


var Zhujiang = {};

/**
 * Margin of Error in PX for centering a client. If client's center is within
 * this PX of workspace center, consider the client centered.
 */
Zhujiang.CENTER_MOE = 2;

Zhujiang.MARGIN_OF_ERROR = 1;

Zhujiang.States = {
  NOOP: 'NOOP',
  DONE: 'DONE',
  ERROR: 'ERROR',
};

/**
 * @param {string} sizesStringList comma separated
 * @return {number[]} No zero/falsies
 */
Zhujiang.sanitizeSizes = function (sizesStringList) {
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
  configSizes = Zhujiang.sanitizeSizes(configSizesString);
  widthOnFirstMove = parseFloat(readConfig('widthOnFirstMove', '').toString());
} catch (err) {
  print(err);
}

if (configSizes.length > 0) {
  Zhujiang.Sizes = configSizes;
  print('Using custom sizes', configSizesString);
} else {
  Zhujiang.Sizes = Zhujiang.sanitizeSizes(DEFAULT_SIZES);
  print('Using DEFAULT_SIZES', DEFAULT_SIZES);
}

Zhujiang.widthOnFirstMove = widthOnFirstMove ? widthOnFirstMove : DEFAULT_WIDTH_ON_FIRST_MOVE;

Zhujiang.Dirs = {
  Left: 'Left',
  Center: 'Center',
  Right: 'Right',
};

/**
 * @return {QRect}
 */
Zhujiang.getWorkAreaRect = function () {
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
Zhujiang.getRightEdge = function (rect) {
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
Zhujiang.sizeToLeftAndRightEdge = function (begin, end, workAreaMinX, workAreaMaxX, workAreaWidth) {
	var workAreaWidth = workAreaMaxX - workAreaMinX;
	return [
		Math.round((begin / 100) * workAreaWidth + workAreaMinX),
		Math.round((end / 100) * workAreaWidth + workAreaMinX)
	];
}

Zhujiang.buildSizes = function () {
	Zhujiang.sizeArray = [];
	var workArea = Zhujiang.getWorkAreaRect();
	var minX = workArea.left;
	var maxX = workArea.right;
	var width = workArea.width;
	Zhujiang.Sizes.forEach(size => {
		Zhujiang.sizeArray.push(Zhujiang.sizeToLeftAndRightEdge(0, size, minX, maxX, width));
		Zhujiang.sizeArray.push(Zhujiang.sizeToLeftAndRightEdge(size, 100, minX, maxX, width));
		// add size combinations
		if (size !== 50) {
			var otherSizes = Zhujiang.Sizes.filter(s => s > size && s !== 50).sort();
			otherSizes.forEach(otherSize => {
				Zhujiang.sizeArray.push(Zhujiang.sizeToLeftAndRightEdge(size, otherSize, minX, maxX, width));
			});
		}
	});
	Zhujiang.sizeArray.push(Zhujiang.sizeToLeftAndRightEdge(0, 100, minX, maxX, width));
	Zhujiang.sizeArray.sort((a, b) => {
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
Zhujiang.getCurrentSizeIndex = function (client) {
	var xMin = client.geometry.left;
	var xMax = client.geometry.right;
	return Zhujiang.sizeArray.findIndex(size => Math.abs(xMin - size[0]) <= Zhujiang.MARGIN_OF_ERROR && Math.abs(xMax - size[1]) <= Zhujiang.MARGIN_OF_ERROR);
}

Zhujiang.isFirstMove = function (client) {
	return Zhujiang.getCurrentSizeIndex(client) === -1;
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 * @return {number} next index e.g. 0
 */
Zhujiang.getNextSizeIndex = function (client, shouldDecrease) {
	var currentSizeIdx = Zhujiang.getCurrentSizeIndex(client);
	var maxPossibleIdx = Zhujiang.sizeArray.length - 1;
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
Zhujiang.getNextSize = function (client, shouldDecrease) {
	return Zhujiang.sizeArray[Zhujiang.getNextSizeIndex(client, shouldDecrease)];
}

Zhujiang.getNextSizeForFirstMove = function (toLeft) {
	var workArea = Zhujiang.getWorkAreaRect();
	var minX = workArea.left;
	var maxX = workArea.right;
	var width = workArea.width;
	return toLeft ?
		Zhujiang.sizeToLeftAndRightEdge(0, Zhujiang.widthOnFirstMove, minX, maxX, width) :
		Zhujiang.sizeToLeftAndRightEdge(Zhujiang.widthOnFirstMove, 100, minX, maxX, width);
}

Zhujiang.setNextSize = function (client, shouldDecrease) {
	if (Zhujiang.beforeMove(client) === Zhujiang.States.ERROR) {
		return Zhujiang.States.ERROR;
	}
	var nextSize = Zhujiang.isFirstMove(client) ?
		Zhujiang.getNextSizeForFirstMove(shouldDecrease) :
		Zhujiang.getNextSize(client, shouldDecrease);

	var rect = client.geometry;
	rect.x = nextSize[0];
	rect.width = nextSize[1] - nextSize[0];
	rect.right = rect.x + rect.width;
	return Zhujiang.States.DONE;
}


/**
 * @param {number} size e.g. 33.3333
 * @return {number} width e.g. 359.9
 */
Zhujiang.sizeToWidth = function (size) {
  return size / 100 * Zhujiang.getWorkAreaRect().width;
};

/**
 * @param {number} clientWidth of client e.g. 359.9
 * @return {number} index in Sizes array. The size is the nearest size to the
 * client width in relation to the workspace width.
 */
Zhujiang.widthToSizeIndex = function (clientWidth) {
  // E.g. if window is 650px and screen is 1080 we'd get 33
  var intWidthPercent = Math.round(clientWidth / Zhujiang.getWorkAreaRect().width * 100);

  var smallestDiff = 9999;
  var smallestI = 0;
  Zhujiang.Sizes.forEach(function (size, i) {
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
Zhujiang.getNextI = function (i) {
  return i >= Zhujiang.Sizes.length - 1 ? 0 : i + 1;
};

/**
 * @param {number} clientWidth like 500 (px)
 * @return {number} width like 333 (px)
 */
Zhujiang.getNextWidth = function (clientWidth) {
  // e.g. 2 is 50, meaning the client is roughly 50% of the workspace width
  var sizeI = Zhujiang.widthToSizeIndex(clientWidth);
  var nextI = Zhujiang.getNextI(sizeI); // would go left 1 or center/right to 3
  var nextSize = Zhujiang.Sizes[nextI]; // 33.3333 or 66.6666
  var nextWidth = Zhujiang.sizeToWidth(nextSize); // whatever px value, e.g. 359.9
  return parseInt(nextWidth, 10);
};

Zhujiang.AfterCycle = {};
Zhujiang.AfterCycle[Zhujiang.Dirs.Left] = function afterCycleLeft(client) {
  return Zhujiang.States.DONE;
};
Zhujiang.AfterCycle[Zhujiang.Dirs.Center] = function afterCycleCenter(client) {
  return Zhujiang.Move[Zhujiang.Dirs.Center](client);
};
Zhujiang.AfterCycle[Zhujiang.Dirs.Right] = function afterCycleRight(client) {
  return Zhujiang.Move[Zhujiang.Dirs.Right](client);
};

/**
 * @param {KWin::AbstractClient} client
 * @param {string} dir 'Left'
 * @return {string} Zhujiang.States value
 */
Zhujiang.cycle = function (client, dir) {
  if (!client.resizeable) {
    return Zhujiang.States.ERROR;
  }

  var rect = client.geometry; // { width, height, x, y }
  var clientWidth = rect.width; // 500
  var nextWidth = Zhujiang.getNextWidth(clientWidth);
  rect.width = nextWidth;
  client.geometry = rect;

  // Move again after cycle to fix reposition due to resize
  var after = Zhujiang.AfterCycle[dir];
  return after && after(client);
};

/**
 * Unmaximize a window without changing size.
 *
 * @param {KWin::AbstractClient} client
 * @return {KWin::AbstractClient} client
 */
Zhujiang.unmax = function (client) {
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
 * @return {string} Zhujiang.States value
 */
Zhujiang.beforeMove = function (client) {
  if (!client.moveable) {
    return Zhujiang.States.ERROR;
  }

  // Horizonatally unmax a client before moving, since you shouldn't be able
  // move a maximized window.
  // setMaximize is documented at https://develop.kde.org/docs/plasma/kwin/api/
  Zhujiang.unmax(client);
  return Zhujiang.States.DONE;
};

Zhujiang.Move = {};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Zhujiang.States value
 */
Zhujiang.Move[Zhujiang.Dirs.Left] = function (client) {
  if (Zhujiang.beforeMove(client) === Zhujiang.States.ERROR) {
    return Zhujiang.States.ERROR;
  }

  var rect = client.geometry;
  var workAreaLeftEdge = Zhujiang.getWorkAreaRect().x;
  var isFlushed = rect.x === workAreaLeftEdge;
  if (isFlushed) {
    return Zhujiang.States.NOOP;
  }

  var rect = client.geometry;
  rect.x = workAreaLeftEdge;
  client.geometry = rect;
  return Zhujiang.States.DONE;
};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Zhujiang.States value
 */
Zhujiang.Move[Zhujiang.Dirs.Right] = function (client) {
  if (Zhujiang.beforeMove(client) === Zhujiang.States.ERROR) {
    return Zhujiang.States.ERROR;
  }

  var rect = client.geometry;
  var clientRightEdge = Zhujiang.getRightEdge(rect);

  var workAreaRect = Zhujiang.getWorkAreaRect();
  var workAreaRightEdge = Zhujiang.getRightEdge(workAreaRect);

  var isFlushed = clientRightEdge === workAreaRightEdge;
  if (isFlushed) {
    return Zhujiang.States.NOOP;
  }

  rect.x = workAreaRightEdge - rect.width;
  client.geometry = rect;
  return Zhujiang.States.DONE;
};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Zhujiang.States value
 */
Zhujiang.Move[Zhujiang.Dirs.Center] = function (client) {
  if (Zhujiang.beforeMove(client) === Zhujiang.States.ERROR) {
    return Zhujiang.States.ERROR;
  }

  var rect = client.geometry;
  var clientWidth = rect.width;
  var workAreaRect = Zhujiang.getWorkAreaRect();
  var workspaceCenterX = (workAreaRect.width / 2) + workAreaRect.x;
  var clientCenterX = rect.x + (clientWidth / 2);
  var isCentered = (
    clientCenterX - Zhujiang.CENTER_MOE <= workspaceCenterX &&
    clientCenterX + Zhujiang.CENTER_MOE >= workspaceCenterX
  );
  if (isCentered) {
    return Zhujiang.States.NOOP;
  }

  var distance = workspaceCenterX - clientCenterX;
  rect.x = rect.x + distance;
  client.geometry = rect;
  return Zhujiang.States.DONE;
};

/**
 * @param {KWin::AbstractClient} client
 * @param {string} key
 * @return {string} Zhujiang.States value
 */
Zhujiang.squish = function (client, key) {
  var dir = Zhujiang.Dirs[key];
  var move = Zhujiang.Move[key];
  if (!move || !dir) {
    print('Unrecognized command');
    return Zhujiang.States.ERROR;
  }

  var result = move(client);
  if (result === Zhujiang.States.NOOP || result === Zhujiang.States.DONE) {
    return Zhujiang.cycle(client, dir);
  }

  print('Failed to move ' + dir);
  return Zhujiang.States.ERROR;
};

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Zhujiang.States value
 */
Zhujiang.yMax = function (client) {
  if (!client || !client.resizeable) {
    return Zhujiang.States.ERROR;
  }

  // Work area for the active cliint, considers things like docks!
  var workAreaRect = Zhujiang.getWorkAreaRect();
  var rect = client.geometry;
  rect.y = workAreaRect.y
  rect.height = workAreaRect.height;
  client.geometry = rect;
  return Zhujiang.States.DONE;
};

Zhujiang.main = function () {

  registerShortcut(
    'left-ymax',
    'Zhujiang: Resize window (left)',
    'ctrl+shift+meta+a',
    function () {
      var client = workspace.activeClient;
      Zhujiang.yMax(client);
	  Zhujiang.buildSizes();
	  Zhujiang.setNextSize(client, true);
    }
  );

  registerShortcut(
    'right-ymax',
    'Zhujiang: Resize window (right)',
    'ctrl+shift+meta+d',
    function () {
      var client = workspace.activeClient;
      Zhujiang.yMax(client);
	  Zhujiang.buildSizes();
	  Zhujiang.setNextSize(client, false);
    }
  );

  registerShortcut(
      'center-ymax',
      'Zhujiang: Resize window (up)',
      'ctrl+shift+meta+w',
      function () {
        var client = workspace.activeClient;
        Zhujiang.yMax(client);
        Zhujiang.squish(client, Zhujiang.Dirs.Center);
      }
    );

  registerShortcut(
        'center-ymin',
        'Zhujiang: Resize window (down)',
        'ctrl+shift+meta+s',
        function () {
          var client = workspace.activeClient;
          Zhujiang.yMax(client);
          Zhujiang.squish(client, Zhujiang.Dirs.Center);
        }
      );
};

Zhujiang.main();

// Expose for testing
try {
  global.Zhujiang = Zhujiang;
} catch (error) {
  /* noop */
}
