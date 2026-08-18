//
//  MeshDropNetwork.m
//  MeshDropMobile
//
//  iOS mirror of the Android NetworkModule.kt: watches the active network
//  transport (Wi-Fi / cellular) and emits a "MeshDropNetworkChanged" JS event
//  when the connection switches networks (Wi-Fi → cellular, router swap, VPN).
//  The bridge reacts by telling the engine to rebuild its swarm: the DHT node
//  + sockets are bound to the previous interface, and only a fresh swarm
//  re-announces this device on the new network. Without this, paired devices
//  stay "offline" until the app is restarted.
//
//  API surface mirrors NetworkModule.kt so bridge.ts needs no branching:
//    - startListening()  registers the SCNetworkReachability callback
//    - checkNow()        re-derives the current state (AppState foreground)
//  Events carry { type: 'wifi'|'cellular'|'other'|'none', online: bool }.
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <SystemConfiguration/SystemConfiguration.h>

@interface MeshDropNetwork : RCTEventEmitter <RCTBridgeModule>
@end

@implementation MeshDropNetwork {
  SCNetworkReachabilityRef _reachability;
  dispatch_queue_t _queue;
  NSString *_lastSig;
  BOOL _registered;
}

RCT_EXPORT_MODULE(MeshDropNetwork)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (instancetype)init
{
  if (self = [super init]) {
    _queue = dispatch_queue_create("com.meshdropmobile.network", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)dealloc
{
  if (_reachability) {
    SCNetworkReachabilitySetCallback(_reachability, NULL, NULL);
    SCNetworkReachabilitySetDispatchQueue(_reachability, NULL);
    CFRelease(_reachability);
    _reachability = NULL;
  }
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"MeshDropNetworkChanged" ];
}

// Reachability callback → emit on the JS thread. Dedupes by the same
// "type:online" signature the Android module uses, so a network switch that
// fires several flag changes only emits one JS event.
static void MeshDropNetworkReachabilityCallback(SCNetworkReachabilityRef target,
                                                SCNetworkReachabilityFlags flags,
                                                void *info)
{
  MeshDropNetwork *self = (__bridge MeshDropNetwork *)info;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self emitChangeWithFlags:flags];
  });
}

- (void)startListening
{
  if (_registered) return;
  _registered = YES;

  struct sockaddr_in zeroAddress;
  memset(&zeroAddress, 0, sizeof(zeroAddress));
  zeroAddress.sin_len = sizeof(zeroAddress);
  zeroAddress.sin_family = AF_INET;

  _reachability = SCNetworkReachabilityCreateWithAddress(kCFAllocatorDefault, (const struct sockaddr *)&zeroAddress);
  if (!_reachability) {
    _registered = NO;
    return;
  }

  SCNetworkReachabilityContext context = {0, (__bridge void *)self, NULL, NULL, NULL};
  if (!SCNetworkReachabilitySetCallback(_reachability, MeshDropNetworkReachabilityCallback, &context)) {
    CFRelease(_reachability);
    _reachability = NULL;
    _registered = NO;
    return;
  }
  if (!SCNetworkReachabilitySetDispatchQueue(_reachability, _queue)) {
    SCNetworkReachabilitySetCallback(_reachability, NULL, NULL);
    CFRelease(_reachability);
    _reachability = NULL;
    _registered = NO;
    return;
  }

  // Emit the initial state so the bridge has a baseline.
  [self checkNow];
}

// Re-derive the active transport and emit MeshDropNetworkChanged only when it
// changed since the last emission. Called when the app returns to the
// foreground: reachability callbacks are not delivered while suspended, so a
// switch that happened in that window would otherwise be missed entirely.
- (void)checkNow
{
  SCNetworkReachabilityFlags flags = 0;
  if (_reachability && SCNetworkReachabilityGetFlags(_reachability, &flags)) {
    [self emitChangeWithFlags:flags];
  }
}

- (void)emitChangeWithFlags:(SCNetworkReachabilityFlags)flags
{
  BOOL reachable = (flags & kSCNetworkReachabilityFlagsReachable) != 0;
  BOOL isWWAN = (flags & kSCNetworkReachabilityFlagsIsWWAN) != 0;
  // If reachable but no route (intervention required), we are effectively
  // offline (captive portal / no route to the DHT bootstrap).
  BOOL online = reachable && !(flags & kSCNetworkReachabilityFlagsConnectionRequired);
  NSString *type = !reachable ? @"none" : (isWWAN ? @"cellular" : @"wifi");
  NSString *sig = [NSString stringWithFormat:@"%@:%@", type, online ? @"true" : @"false"];
  if ([sig isEqualToString:_lastSig]) return;
  _lastSig = sig;

  [self sendEventWithName:@"MeshDropNetworkChanged" body:@{ @"type": type, @"online": @(online) }];
}

@end
