import Toybox.Lang;

//! Lightweight, memory-safe Google Encoded Polyline decoder.
//! Converts ASCII delta strings into a flat array of microdegrees (1e-5 degrees).
class PolylineDecoder {

    // Maximum decoded points limit to safeguard Data Field memory quota (<1KB heap)
    public static const MAX_POINTS = 150;

    //! Decodes a Google Encoded Polyline string.
    //! @param str The encoded polyline string
    //! @return Flat array [lat0, lon0, lat1, lon1, ...] in microdegrees (1e-5 deg)
    public static function decode(str as String?) as Array<Number> {
        if (str == null || str.length() == 0) {
            return [] as Array<Number>;
        }

        var chars = str.toCharArray();
        var len = chars.size();
        var index = 0;

        var lat = 0;
        var lon = 0;

        // Pre-allocate fixed-size array to avoid GC fragmentation from dynamic resizing
        var temp = new [MAX_POINTS * 2];
        var count = 0;

        while (index < len && count < MAX_POINTS * 2) {
            // 1. Decode Latitude Delta
            var b = 0;
            var shift = 0;
            var result = 0;

            do {
                if (index >= len) {
                    break;
                }
                b = chars[index].toNumber() - 63;
                index++;
                result = result | ((b & 0x1F) << shift);
                shift += 5;
            } while (b >= 0x20);

            var dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            // 2. Decode Longitude Delta
            shift = 0;
            result = 0;

            do {
                if (index >= len) {
                    break;
                }
                b = chars[index].toNumber() - 63;
                index++;
                result = result | ((b & 0x1F) << shift);
                shift += 5;
            } while (b >= 0x20);

            var dlon = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
            lon += dlon;

            temp[count] = lat;
            temp[count + 1] = lon;
            count += 2;
        }

        // Return exact-sized array and release temporary buffer
        var points = new [count] as Array<Number>;
        for (var i = 0; i < count; i++) {
            points[i] = temp[i];
        }

        return points;
    }
}
