import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Application entry point managing lifecycle and live settings change events
class RouteApp extends Application.AppBase {

    private var mDataField as RouteDataField?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    //! Returns the initial Data Field view
    function getInitialView() as [Views] or [Views, InputDelegates] {
        mDataField = new RouteDataField();
        return [ mDataField ];
    }

    //! Triggered when user updates and saves settings in the Garmin Connect mobile app
    function onSettingsChanged() as Void {
        try {
            if (mDataField != null) {
                mDataField.reloadRoute();
            }
            WatchUi.requestUpdate();
        } catch (e) {
        }
    }
}

function getApp() as RouteApp {
    return Application.getApp() as RouteApp;
}
