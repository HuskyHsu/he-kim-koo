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

        // Use UTF-8 ByteArray (1 byte/char) instead of boxed Array<Char> to minimize heap spike
        var bytes = str.toUtf8Array();
        var len = bytes.size();
        var index = 0;

        var lat = 0;
        var lon = 0;
        var maxCoords = MAX_POINTS * 2;

        // Pre-allocate fixed-size array to avoid GC fragmentation from dynamic resizing
        var temp = new [maxCoords] as Array<Number>;
        var count = 0;

        while (index < len && count < maxCoords) {
            var b = 0;
            var shift = 0;
            var result = 0;
            var incomplete = false;

            do {
                if (index >= len) {
                    incomplete = true;
                    break;
                }
                b = bytes[index] - 63;
                index++;
                result = result | ((b & 0x1F) << shift);
                shift += 5;
            } while (b >= 0x20);

            if (incomplete) {
                break;
            }

            var delta = ((result & 1) != 0) ? ~(result >> 1) : (result >> 1);
            if ((count & 1) == 0) {
                lat += delta;
                temp[count] = lat;
            } else {
                lon += delta;
                temp[count] = lon;
            }
            count++;
        }

        // Ensure complete (lat, lon) pairs only
        count = count & ~1;
        if (count == maxCoords) {
            return temp;
        }
        return temp.slice(0, count) as Array<Number>;
    }
}
