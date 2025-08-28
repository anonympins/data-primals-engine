import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon issue with webpack/parcel
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png'
});


const LocationMarker = ({ position, setPosition, name, onChange, value }) => {
    const map = useMapEvents({
        click(e) {
            const { lat, lng } = e.latlng;
            const newPos = [lat, lng];
            setPosition(newPos);
            map.flyTo(newPos, map.getZoom());
            onChange({
                name: name,
                value: {
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            });
        },
        locationfound(e) {
            const { lat, lng } = e.latlng;
            const newPos = [lat, lng];
            setPosition(newPos);
            map.flyTo(newPos, map.getZoom());
            onChange({
                name: name,
                value: {
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            });
        },
    });

    useEffect(() => {
        // If there's no value, try to locate user
        if (!value) {
             map.locate();
        }
    }, [map, value]);


    return position === null ? null : (
        <Marker position={position}>
            <Popup>Selected location</Popup>
        </Marker>
    );
}

const GeolocationField = ({ value, onChange, name }) => {
    // Default to a central location if no value is provided, e.g., Paris
    const initialPosition = (value && value.coordinates && value.coordinates.length === 2)
        ? [value.coordinates[1], value.coordinates[0]] // Leaflet uses [lat, lng], GeoJSON uses [lng, lat]
        : [48.8566, 2.3522]; // Default to Paris

    const [position, setPosition] = useState(initialPosition);

    useEffect(() => {
        if (value && value.coordinates && value.coordinates.length === 2) {
            const newPos = [value.coordinates[1], value.coordinates[0]];
            if (position[0] !== newPos[0] || position[1] !== newPos[1]) {
                setPosition(newPos);
            }
        } else {
            // If value is cleared, reset to default. The map.locate() will try to find the user.
            setPosition([48.8566, 2.3522]);
        }
    }, [value]);

    return (
        <div style={{ height: '300px', width: '100%' }}>
            <MapContainer center={position} zoom={13} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker position={position} setPosition={setPosition} name={name} onChange={onChange} value={value} />
            </MapContainer>
        </div>
    );
};

export default GeolocationField;