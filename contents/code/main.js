var Zhujiang = {};

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
var DEFAULT_WIDTH_ON_FIRST_HORIZONTAL_MOVE = '50';

var configSizes = [];
var configSizesString = '';
var widthOnFirstMove;
try {
  var configSizesString = readConfig('sizes', '').toString();
  configSizes = Zhujiang.sanitizeSizes(configSizesString);
  widthOnFirstMove = parseFloat(readConfig('widthOnFirstHorizontalMove', '').toString());
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

Zhujiang.widthOnFirstMove = widthOnFirstMove ? widthOnFirstMove : DEFAULT_WIDTH_ON_FIRST_HORIZONTAL_MOVE;

Zhujiang.Dirs = {
  Left: 'Left',
  Right: 'Right',
  Up: 'Up',
  Down: 'Down'
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
 * @param {number} begin e.g. 33.33
 * @param {number} end e.g. 1
 * @param {number} workAreaMinX e.g. 0
 * @param {number} workAreaMaxX e.g. 1024
 * @param {number} workAreaWidth e.g. 1024
 * @return {number[]} width e.g. [338, 1024]
 */
Zhujiang.sizeToLeftAndRightEdge = function (begin, end, workAreaMinX, workAreaMaxX, workAreaWidth) {
	//var workAreaWidth = workAreaMaxX - workAreaMinX;  // TODO: hä?!
	return [
		Math.round((begin / 100) * workAreaWidth + workAreaMinX),
		Math.round((end / 100) * workAreaWidth + workAreaMinX)
	];
}

Zhujiang.buildSizes = function () {
	var workArea = Zhujiang.getWorkAreaRect();
	var minX = workArea.left;
	var maxX = workArea.right;
	var width = workArea.width;

	Zhujiang.uncenteredSizes = [];
	Zhujiang.Sizes.forEach(size => {
		Zhujiang.uncenteredSizes.push(Zhujiang.sizeToLeftAndRightEdge(0, size, minX, maxX, width));
		Zhujiang.uncenteredSizes.push(Zhujiang.sizeToLeftAndRightEdge(size, 100, minX, maxX, width));
	});
	Zhujiang.uncenteredSizes.push(Zhujiang.sizeToLeftAndRightEdge(0, 100, minX, maxX, width));
	Zhujiang.uncenteredSizes.sort((a, b) => {
	    if (a[0] > b[0]) return 1;
        if (a[0] < b[0]) return -1;
        if (a[0] === b[0]) {
            if (a[1] > b[1]) return 1;
            if (a[1] < b[1]) return -1;
            return 0;
        }
    });

	Zhujiang.centeredSizes = [];
	Zhujiang.Sizes
	    .filter(size => size > 0 && size < 50)
	    .sort()
	    .forEach(size => {
	        Zhujiang.centeredSizes.push(Zhujiang.sizeToLeftAndRightEdge(size, 100 - size, minX, maxX, width))
	    });
  Zhujiang.centeredSizes.push(Zhujiang.sizeToLeftAndRightEdge(25, 75, minX, maxX, width));
  Zhujiang.centeredSizes.push(Zhujiang.sizeToLeftAndRightEdge(0, 100, minX, maxX, width));
}

/**
 * @param {KWin::AbstractClient} client
 * @return {number} index e.g. -1
 */
Zhujiang.getCurrentSizeIndex = function (client, centered) {
	var xMin = client.geometry.left;
	var xMax = client.geometry.right;
	var sizes = centered ? Zhujiang.centeredSizes : Zhujiang.uncenteredSizes;
	return sizes.findIndex(size => Math.abs(xMin - size[0]) <= Zhujiang.MARGIN_OF_ERROR && Math.abs(xMax - size[1]) <= Zhujiang.MARGIN_OF_ERROR);
}

/**
 * @param {KWin::AbstractClient} client
 */
Zhujiang.isFirstMove = function (client, centered) {
	return Zhujiang.getCurrentSizeIndex(client, centered) === -1;
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 */
Zhujiang.getNextCenteredSizeIndex = function (client, shouldDecrease) {
    var currentSizeIdx = Zhujiang.getCurrentSizeIndex(client, true);
    var maxPossibleIdx = Zhujiang.centeredSizes.length - 1;
    if (currentSizeIdx === -1) {
        return shouldDecrease ? 0 : maxPossibleIdx;
    }
    return shouldDecrease ? currentSizeIdx - 1 : Math.min(currentSizeIdx + 1, maxPossibleIdx);
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 * @return {number} next index e.g. 0
 */
Zhujiang.getNextUncenteredSizeIndex = function (client, shouldDecrease) {
	var currentSizeIdx = Zhujiang.getCurrentSizeIndex(client, false);
	var maxPossibleIdx = Zhujiang.uncenteredSizes.length - 1;
	if (currentSizeIdx === -1) {
		return shouldDecrease ? 0 : maxPossibleIdx;
	}
	return shouldDecrease ? Math.max(currentSizeIdx - 1, 0) : Math.min(currentSizeIdx + 1, maxPossibleIdx);
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 * @param {boolean} centered - whether the window should be centered or not
 */
Zhujiang.getNextSize = function (client, shouldDecrease, centered) {
    return centered ?
        Zhujiang.centeredSizes[Zhujiang.getNextCenteredSizeIndex(client, shouldDecrease)] :
        Zhujiang.uncenteredSizes[Zhujiang.getNextUncenteredSizeIndex(client, shouldDecrease)];
}

/**
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 * @param {boolean} centered - whether the window should be centered or not
 */
Zhujiang.getNextSizeForFirstMove = function (shouldDecrease, centered) {
	var workArea = Zhujiang.getWorkAreaRect();
	var minX = workArea.left;
	var maxX = workArea.right;
	var width = workArea.width;
	if (centered) {
	    return shouldDecrease ?
	        [Zhujiang.centeredSizes[0][0], Zhujiang.centeredSizes[0][1]] :
	        Zhujiang.sizeToLeftAndRightEdge(0, 100, minX, maxX, width);
	} else {
	    return shouldDecrease ?
            Zhujiang.sizeToLeftAndRightEdge(0, Zhujiang.widthOnFirstMove, minX, maxX, width) :
            Zhujiang.sizeToLeftAndRightEdge(Zhujiang.widthOnFirstMove, 100, minX, maxX, width);
	}
}

Zhujiang.detachWindow = function (client) {
    var workArea = Zhujiang.getWorkAreaRect();
    var minX = workArea.left;
    var minY = workArea.top;
    var width = workArea.width;
    var height = workArea.height;

    var rect = client.geometry;
    rect.height = Math.round(height * 0.66);
    rect.width = Math.round(width * 0.33);
    rect.y = minY + Math.round(rect.height / 4);
    rect.x = minX + rect.width;
    return Zhujiang.States.DONE;
}

Zhujiang.resizeWindowFirstMove = function (client, shouldDecrease, centered) {
    var nextSize = Zhujiang.getNextSizeForFirstMove(shouldDecrease, centered);
    var rect = client.geometry;
    rect.x = nextSize[0];
    rect.width = nextSize[1] - nextSize[0];
    rect.right = rect.x + rect.width;
    return Zhujiang.States.DONE;
}

Zhujiang.resizeWindow = function (client, shouldDecrease, centered) {
    var nextSize;
    if (centered) {
        var nextSizeIndex = Zhujiang.getNextCenteredSizeIndex(client, shouldDecrease);
        if (nextSizeIndex === -1) {
            return Zhujiang.detachWindow(client);
        }
        nextSize = Zhujiang.centeredSizes[nextSizeIndex];
    } else {
        nextSize = Zhujiang.uncenteredSizes[Zhujiang.getNextUncenteredSizeIndex(client, shouldDecrease)];
    }
    var rect = client.geometry;
    rect.x = nextSize[0];
    rect.width = nextSize[1] - nextSize[0];
    rect.right = rect.x + rect.width;
    return Zhujiang.States.DONE;
}

/**
 * @param {KWin::AbstractClient} client
 * @param {boolean} shouldDecrease - whether the index should decrease or increase
 */
Zhujiang.setNextSize = function (client, shouldDecrease, centered) {
    if (Zhujiang.beforeMove(client) === Zhujiang.States.ERROR) {
		return Zhujiang.States.ERROR;
	}

    return Zhujiang.isFirstMove(client, centered) ?
        Zhujiang.resizeWindowFirstMove(client, shouldDecrease, centered) :
        Zhujiang.resizeWindow(client, shouldDecrease, centered);
}

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

/**
 * @param {KWin::AbstractClient} client
 * @return {string} Zhujiang.States value
 */
Zhujiang.yMax = function (client) {
  if (!client || !client.resizeable) {
    return Zhujiang.States.ERROR;
  }

  // Work area for the active client, considers things like docks!
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
	  Zhujiang.setNextSize(client, true, false);
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
	  Zhujiang.setNextSize(client, false, false);
    }
  );

  registerShortcut(
      'center-ymax',
      'Zhujiang: Resize window (up)',
      'ctrl+shift+meta+w',
      function () {
        var client = workspace.activeClient;
        Zhujiang.yMax(client);
        Zhujiang.buildSizes();
        Zhujiang.setNextSize(client, false, true);
      }
    );

  registerShortcut(
        'center-ymin',
        'Zhujiang: Resize window (down)',
        'ctrl+shift+meta+s',
        function () {
          var client = workspace.activeClient;
          Zhujiang.yMax(client);
          Zhujiang.buildSizes();
          Zhujiang.setNextSize(client, true, true);
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
