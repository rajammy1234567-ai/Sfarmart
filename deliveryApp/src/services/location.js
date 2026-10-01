import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {Platform} from 'react-native';
import {riderApi} from './api';
import storage from './storage';
const TASK='farmart-rider-location';
export function locationPayload(position){
 const c=position.coords;
 if(c.accuracy==null || c.accuracy>100 || Date.now()-position.timestamp>120000)throw new Error('GPS accuracy is low. Move outdoors and retry.');
 return {lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,capturedAt:position.timestamp,heading:Math.max(0,c.heading || 0),speed:Math.max(0,c.speed || 0)*3.6};
}
TaskManager.defineTask(TASK,async({data,error})=>{
 if(error || !data?.locations?.length || !await storage.getToken())return;
 const rider=await storage.getRider();if(!rider || rider.status==='OFFLINE')return;
 try {await riderApi.sendLocation(locationPayload(data.locations[data.locations.length-1]));}catch(e){console.warn('Background GPS upload failed:',e.message);}
});
export async function sendCurrentLocation(){
 const permission=await Location.requestForegroundPermissionsAsync();
 if(permission.status!=='granted')throw new Error('Allow precise location permission to go online.');
 const fix=locationPayload(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High}));
 await riderApi.sendLocation(fix);return fix;
}
export async function startBackgroundLocation(){
 if(Platform.OS==='web')return false;
 if(!await TaskManager.isAvailableAsync())return false;
 const permission=await Location.requestBackgroundPermissionsAsync();
 if(permission.status!=='granted')return false;
 if(!await Location.hasStartedLocationUpdatesAsync(TASK))await Location.startLocationUpdatesAsync(TASK,{
  accuracy:Location.Accuracy.High,distanceInterval:10,timeInterval:5000,pausesUpdatesAutomatically:false,
  showsBackgroundLocationIndicator:true,foregroundService:{notificationTitle:'Farmart delivery location',notificationBody:'Your location is shared while you are on duty.',killServiceOnDestroy:true}
 });return true;
}
export async function stopBackgroundLocation(){
 if(Platform.OS!=='web' && await TaskManager.isAvailableAsync() && await Location.hasStartedLocationUpdatesAsync(TASK))await Location.stopLocationUpdatesAsync(TASK);
}
