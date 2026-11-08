// Usable GPIO pin definitions for the 30-pin ESP32 DevKit V1
const int D4   = 4;
const int D13  = 13;
const int D14  = 14;
const int D12  = 12; // Use with caution (boot strapping pin)
const int D27  = 27;
const int D26  = 26;
const int D25  = 25;
const int D32  = 32;
const int D33  = 33;
const int D23  = 23;
const int D22  = 22;
const int D21  = 21;
const int D19  = 19;
const int D18  = 18;
const int D4_R = 4;  // Right side D4 (same as left D4)
const int D2   = 2;  // Use with caution (boot strapping pin)
const int D15  = 15; // Use with caution (boot strapping pin)
const int D5   = 5;  // Use with caution (boot strapping pin)

// LED pin definitions (all 13 mapped to explicit pin numbers)
int LED1  = D4;
int LED2  = 16; // RX2 (GPIO 16)
int LED3  = 17; // TX2 (GPIO 17)
int LED4  = D5;
int LED5  = D18;
int LED6  = D19;
int LED7  = D21;
int LED8  = D22;
int LED9  = D13;
int LED10 = D14;
int LED11 = D27;
int LED12 = D26;
int LED13 = D25;

// Array mapping all 13 LED pin variables for easy iteration
int ledPins[13] = {
    LED1, LED2, LED3, LED4, LED5, 
    LED6, LED7, LED8, LED9, LED10, 
    LED11, LED12, LED13
};

// Structure to store 3D coordinates for each LED
struct Point3D {
    float x;
    float y;
    float z;
};

// Helmet sphere radius (e.g., 10.0 cm)
const float HELMET_RADIUS = 10.0;

// Lookup table for all 13 LEDs based on spherical coordinates
Point3D ledPositions[13] = {
    // LED 1 (Index 0): Top pole
    {0.0f, 0.0f, HELMET_RADIUS},
    
    // LEDs 2 - 7 (Indices 1 to 6): Upper ring at 40 degrees elevation
    { HELMET_RADIUS * cos(radians(40.0)) * cos(radians(0.0)),   HELMET_RADIUS * cos(radians(40.0)) * sin(radians(0.0)),   HELMET_RADIUS * sin(radians(40.0)) },
    { HELMET_RADIUS * cos(radians(40.0)) * cos(radians(60.0)),  HELMET_RADIUS * cos(radians(40.0)) * sin(radians(60.0)),  HELMET_RADIUS * sin(radians(40.0)) },
    { HELMET_RADIUS * cos(radians(40.0)) * cos(radians(120.0)), HELMET_RADIUS * cos(radians(40.0)) * sin(radians(120.0)), HELMET_RADIUS * sin(radians(40.0)) },
    { HELMET_RADIUS * cos(radians(40.0)) * cos(radians(180.0)), HELMET_RADIUS * cos(radians(40.0)) * sin(radians(180.0)), HELMET_RADIUS * sin(radians(40.0)) },
    { HELMET_RADIUS * cos(radians(40.0)) * cos(radians(240.0)), HELMET_RADIUS * cos(radians(40.0)) * sin(radians(240.0)), HELMET_RADIUS * sin(radians(40.0)) },
    { HELMET_RADIUS * cos(radians(40.0)) * cos(radians(300.0)), HELMET_RADIUS * cos(radians(40.0)) * sin(radians(300.0)), HELMET_RADIUS * sin(radians(40.0)) },

    // LEDs 8 - 13 (Indices 7 to 12): Equatorial ring on XY plane (z = 0)
    { HELMET_RADIUS * cos(radians(0.0)),   HELMET_RADIUS * sin(radians(0.0)),   0.0f },
    { HELMET_RADIUS * cos(radians(60.0)),  HELMET_RADIUS * sin(radians(60.0)),  0.0f },
    { HELMET_RADIUS * cos(radians(120.0)), HELMET_RADIUS * sin(radians(120.0)), 0.0f },
    { HELMET_RADIUS * cos(radians(180.0)), HELMET_RADIUS * sin(radians(180.0)), 0.0f },
    { HELMET_RADIUS * cos(radians(240.0)), HELMET_RADIUS * sin(radians(240.0)), 0.0f },
    { HELMET_RADIUS * cos(radians(300.0)), HELMET_RADIUS * sin(radians(300.0)), 0.0f }
};

// Forward declarations
void test_blink();
void runWave(float targetX, float targetY, float targetZ);
void calculateDelays(float targetX, float targetY, float targetZ, unsigned long delaysOut[13]);

void setup() {
  // Initialize all 13 LED pins as outputs
  for (int i = 0; i < 13; i++) {
    pinMode(ledPins[i], OUTPUT);
  }
}

void loop() {
  // Example 1: Run your standard test blink
  //test_blink();
  
  // Example 2: Trigger a spatial wave focused on a target point in front of the helmet
  runWave(0.0f, 5.0f, 2.0f);
  delay(1000);
}

void test_blink() {
  // Turn all 13 LEDs ON
  for (int i = 0; i < 13; i++) {
    digitalWrite(ledPins[i], HIGH);
  }
  delay(500);

  // Turn all 13 LEDs OFF
  for (int i = 0; i < 13; i++) {
    digitalWrite(ledPins[i], LOW);
  }
  delay(500);
}

void calculateDelays(float targetX, float targetY, float targetZ, unsigned long delaysOut[13]) {
    float distances[13];
    float maxDist = 0.0f;
    
    // Calculate Euclidean distance from each LED to the target point
    for (int i = 0; i < 13; i++) {
        float dx = ledPositions[i].x - targetX;
        float dy = ledPositions[i].y - targetY;
        float dz = ledPositions[i].z - targetZ;
        distances[i] = sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distances[i] > maxDist) {
            maxDist = distances[i];
        }
    }
    
    // Convert distances into normalized time delays
    float waveSpeedFactor = 150.0f; 
    for (int i = 0; i < 13; i++) {
        delaysOut[i] = (unsigned long)((maxDist - distances[i]) * waveSpeedFactor);
    }
}

void runWave(float targetX, float targetY, float targetZ) {
  unsigned long delaysOut[13];
  calculateDelays(targetX, targetY, targetZ, delaysOut);
  
  unsigned long startTime = millis();
  bool ledState[13] = {false};
  
  while (true) {
    unsigned long currentTime = millis();
    unsigned long elapsed = currentTime - startTime;
    bool allFinished = true;
    
    for (int i = 0; i < 13; i++) {
      if (!ledState[i]) {
        if (elapsed >= delaysOut[i]) {
          digitalWrite(ledPins[i], HIGH);
          ledState[i] = true;
        } else {
          allFinished = false; 
        }
      }
    }
    
    if (allFinished) {
      break; 
    }
  }
  
  delay(200);
  for (int i = 0; i < 13; i++) {
    digitalWrite(ledPins[i], LOW);
  }
  delay(200);
}