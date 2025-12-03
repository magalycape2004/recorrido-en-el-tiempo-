/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function () {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');
  var timeTravelToggleElement = document.querySelector('#timeTravelToggle');
  var gyroscopeToggleElement = document.querySelector('#gyroscopeToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function () {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function () {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function (data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100 * Math.PI / 180, 120 * Math.PI / 180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    var timeTravelTarget = null;
    data.linkHotspots.forEach(function (hotspot) {
      if (Math.abs(hotspot.pitch) > 1.4) {
        timeTravelTarget = hotspot.target;
      } else {
        var element = createLinkHotspotElement(hotspot);
        scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
      }
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function (hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view,
      timeTravelTarget: timeTravelTarget
    };
  });



  // Set up fullscreen mode - Chrome Android requires direct synchronous call from user gesture
  if (screenfull.enabled) {
    document.body.classList.add('fullscreen-enabled');
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Fullscreen toggle with direct native call (no wrapper function)
  fullscreenToggleElement.addEventListener('click', function () {
    var doc = window.document;
    var docEl = doc.documentElement;

    // Check if already in fullscreen
    var isFullscreen = doc.fullscreenElement || doc.mozFullScreenElement ||
      doc.webkitFullscreenElement || doc.msFullscreenElement;

    if (!isFullscreen) {
      // Enter fullscreen - try with navigationUI option first (Chrome 71+ Android)
      var requestFullScreen = docEl.requestFullscreen || docEl.mozRequestFullScreen ||
        docEl.webkitRequestFullScreen || docEl.msRequestFullscreen;

      if (requestFullScreen) {
        try {
          // Chrome Android: try with navigationUI hide option for immersive mode
          var promise = requestFullScreen.call(docEl, { navigationUI: "hide" });
          if (promise && promise.catch) {
            promise.catch(function (err) {
              console.log('Fullscreen request with navigationUI failed, trying without options:', err);
              // Fallback without options
              requestFullScreen.call(docEl);
            });
          }
        } catch (e) {
          // Fallback for browsers that don't support options
          try {
            requestFullScreen.call(docEl);
          } catch (err) {
            console.error('Fullscreen request failed:', err);
          }
        }
      }
    } else {
      // Exit fullscreen
      var cancelFullScreen = doc.exitFullscreen || doc.mozCancelFullScreen ||
        doc.webkitExitFullscreen || doc.msExitFullscreen;
      if (cancelFullScreen) {
        cancelFullScreen.call(doc);
      }
    }
  });

  // Listen for fullscreen changes to update button state
  var fullscreenChangeEvents = ['fullscreenchange', 'mozfullscreenchange',
    'webkitfullscreenchange', 'msfullscreenchange'];

  fullscreenChangeEvents.forEach(function (eventName) {
    document.addEventListener(eventName, function () {
      var isFullscreen = document.fullscreenElement || document.mozFullScreenElement ||
        document.webkitFullscreenElement || document.msFullscreenElement;

      if (isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  });



  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement', new Marzipano.ElementPressControlMethod(viewUpElement, 'y', -velocity, friction), true);
  controls.registerMethod('downElement', new Marzipano.ElementPressControlMethod(viewDownElement, 'y', velocity, friction), true);
  controls.registerMethod('leftElement', new Marzipano.ElementPressControlMethod(viewLeftElement, 'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement, 'x', velocity, friction), true);
  controls.registerMethod('inElement', new Marzipano.ElementPressControlMethod(viewInElement, 'zoom', -velocity, friction), true);
  controls.registerMethod('outElement', new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom', velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    updateSceneName(scene);
    updateTimeTravelButton(scene);
    updateCurrentScene(scene);
  }

  function updateCurrentScene(scene) {
    currentScene = scene;
    if (enabled) {
      // Sync the view when changing scenes if gyroscope is enabled
      // deviceOrientationControlMethod.getPitch(function(err, pitch) {
      //   if (!err) {
      //     scene.view.setPitch(pitch);
      //   }
      // });
    }
  }

  function updateTimeTravelButton(scene) {
    if (scene.timeTravelTarget) {
      timeTravelToggleElement.classList.add('enabled');
    } else {
      timeTravelToggleElement.classList.remove('enabled');
    }
  }

  timeTravelToggleElement.addEventListener('click', function () {
    var currentScene = scenes.find(function (s) {
      return s.data.id === sceneNameElement.getAttribute('data-id');
    });
    if (currentScene && currentScene.timeTravelTarget) {
      switchScene(findSceneById(currentScene.timeTravelTarget));
    }
  });

  function updateSceneName(scene) {
    var rawName = scene.data.name.toLowerCase();
    var displayName = "Museo Juan Manuel Blanes"; // Default

    if (rawName.indexOf('old') !== -1) {
      displayName = "Casa Quinta de Raffo";
    }

    sceneNameElement.innerHTML = sanitize(displayName);
    sceneNameElement.setAttribute('data-id', scene.data.id);
  }



  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create glassmorphism circle container
    var circleContainer = document.createElement('div');
    circleContainer.classList.add('link-hotspot-circle');

    // Create image element with walking SVG
    var icon = document.createElement('img');
    icon.src = 'img/icons/walking.svg';
    icon.classList.add('link-hotspot-icon');

    // Note: Rotation is NOT applied to the icon itself anymore
    // The circle rotates, but the walking icon stays upright for readability

    // Append icon to circle
    circleContainer.appendChild(icon);

    // Add click event handler.
    wrapper.addEventListener('click', function () {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(circleContainer);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create glassmorphism circle container (visible hotspot)
    var circleContainer = document.createElement('div');
    circleContainer.classList.add('info-hotspot-circle');

    // Create info icon with SVG
    var icon = document.createElement('img');
    icon.src = 'img/icons/info-circle.svg';
    icon.classList.add('info-hotspot-icon');

    // Append icon to circle
    circleContainer.appendChild(icon);
    wrapper.appendChild(circleContainer);

    // Create modal panel for content (glassmorphism panel)
    // IMPORTANT: Append to body, not to wrapper, to avoid 3D transform issues
    var modal = document.createElement('div');
    modal.classList.add('info-hotspot-modal');

    // Create modal header
    var modalHeader = document.createElement('div');
    modalHeader.classList.add('info-modal-header');

    var modalTitle = document.createElement('h3');
    modalTitle.classList.add('info-modal-title');
    modalTitle.innerHTML = hotspot.title;

    var closeButton = document.createElement('div');
    closeButton.classList.add('info-modal-close');
    closeButton.innerHTML = '×';

    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);

    // Create modal content
    var modalContent = document.createElement('div');
    modalContent.classList.add('info-modal-content');
    modalContent.innerHTML = hotspot.text;

    // Assemble modal
    modal.appendChild(modalHeader);
    modal.appendChild(modalContent);

    // Append modal to body (not to wrapper!)
    document.body.appendChild(modal);

    var toggle = function () {
      modal.classList.toggle('visible');
    };

    // Show modal when circle is clicked
    circleContainer.addEventListener('click', toggle);

    // Hide modal when close button is clicked
    closeButton.addEventListener('click', function (e) {
      e.stopPropagation();
      toggle();
    });

    // Hide modal when clicking outside of it
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        toggle();
      }
    });

    // Prevent touch and scroll events from reaching the parent element
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = ['touchstart', 'touchmove', 'touchend', 'touchcancel',
      'wheel', 'mousewheel'];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function (event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene - start with modern "2a" not old version
  var initialScene = findSceneById('0-2a') || scenes[0]; // Fallback to first scene if not found
  switchScene(initialScene);

  // Gyroscope control logic
  var enabled = false;
  var currentScene = initialScene;
  var deviceOrientationControlMethod = new DeviceOrientationControlMethod();
  var controls = viewer.controls();
  controls.registerMethod('deviceOrientation', deviceOrientationControlMethod);

  function enableGyroscope() {
    deviceOrientationControlMethod.getPitch(function (err, pitch) {
      if (!err) {
        currentScene.view.setPitch(pitch);
      }
    });
    controls.enableMethod('deviceOrientation');
    enabled = true;
    gyroscopeToggleElement.classList.add('enabled');
  }

  function disableGyroscope() {
    controls.disableMethod('deviceOrientation');
    enabled = false;
    gyroscopeToggleElement.classList.remove('enabled');
  }

  function toggleGyroscope() {
    if (enabled) {
      disableGyroscope();
    } else {
      requestPermissionForIOS();
    }
  }

  function requestPermissionForIOS() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(function (response) {
          if (response === 'granted') {
            enableGyroscope();
          }
        })
        .catch(function (console) {
          console.error(console);
        });
    } else {
      enableGyroscope();
    }
  }

  gyroscopeToggleElement.addEventListener('click', toggleGyroscope);

  // Disable gyroscope by default
  disableGyroscope();

})();
