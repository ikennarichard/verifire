/* eslint-disable react-native/no-inline-styles */
import React, {useState, useEffect, useCallback} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
  NativeEventEmitter,
  Platform,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import DocumentReader, {
  Enum,
  DocumentReaderCompletion,
  DocumentReaderScenario,
  RNRegulaDocumentReader,
  DocumentReaderResults,
  DocumentReaderNotification,
  ScannerConfig,
  RecognizeConfig,
  DocReaderConfig,
  Functionality,
} from '@regulaforensics/react-native-document-reader-api';
import * as RNFS from 'react-native-fs';
import RadioGroup from 'react-native-radio-buttons-group';
import Icon from 'react-native-vector-icons/FontAwesome';
import {launchImageLibrary} from 'react-native-image-picker';
import * as Progress from 'react-native-progress';

type VerifierState = {
  fullName: string | undefined;
  doRfid: boolean;
  isReadingRfidCustomUi: boolean;
  rfidUIHeader: string;
  rfidUIHeaderColor: string;
  rfidDescription: string;
  rfidProgress: number;
  canRfid: boolean;
  canRfidTitle: string;
  radioButtons: Array<{label: string; id: string}>;
  selectedScenario: string;
  portrait: any;
  docFront: any;
  isAuthentic: boolean | null; // New state for authenticity
  authenticityMessage: string; // Message about authenticity
  isLoading: boolean; // For loading states
}

const App: React.FC = () => {
  // State management
  const [state, setState] = useState<VerifierState>({
    fullName: 'Please wait...',
    doRfid: false,
    isReadingRfidCustomUi: false,
    rfidUIHeader: '',
    rfidUIHeaderColor: '#333',
    rfidDescription: '',
    rfidProgress: -1,
    canRfid: false,
    canRfidTitle: '(unavailable)',
    radioButtons: [{label: 'Loading', id: '0'}],
    selectedScenario: '',
    portrait: require('./images/portrait.png'),
    docFront: require('./images/id.png'),
    isAuthentic: null,
    authenticityMessage: '',
    isLoading: false,
  });
  const [isReadingRfid, setIsReadingRfid] = useState(false);

  // Helper to update state
  const updateState = useCallback((newState: Partial<VerifierState>) => {
    setState(prevState => ({...prevState, ...newState}));
  }, []);

  // Initialize Document Reader
  const initializeReader = useCallback(async () => {
    try {
      const licPath =
        Platform.OS === 'ios'
          ? `${RNFS.MainBundlePath}/regula.license`
          : 'regula.license';
      const readFile =
        Platform.OS === 'ios' ? RNFS.readFile : RNFS.readFileAssets;
      const license = await readFile(licPath, 'base64');

      updateState({fullName: 'Initializing...', isLoading: true});
      const config = new DocReaderConfig();
      config.license = license;
      config.delayedNNLoad = true;

      DocumentReader.initializeReader(
        config,
        response => {
          const parsedResponse = JSON.parse(response);
          if (!parsedResponse.success) {
            updateState({fullName: 'Initialization Failed', isLoading: false});
            return;
          }

          DocumentReader.getIsRFIDAvailableForUse(
            canRfid => {
              if (canRfid) {
                updateState({
                  canRfid: true,
                  rfidUIHeader: 'Reading RFID',
                  rfidDescription: 'Place your phone on top of the NFC tag',
                  rfidUIHeaderColor: '#333',
                  canRfidTitle: '',
                });
              }
            },
            error => console.log(error),
          );

          DocumentReader.getAvailableScenarios(
            jstring => {
              const scenarios = JSON.parse(jstring);
              const items = scenarios.map((scenario: any) => {
                const scenarioObj = DocumentReaderScenario.fromJson(
                  typeof scenario === 'string'
                    ? JSON.parse(scenario)
                    : scenario,
                );
                return {label: scenarioObj?.name, id: scenarioObj?.name};
              });
              updateState({
                radioButtons: items,
                selectedScenario: items[0]?.id,
              });
            },
            error => console.log(error),
          );

          const functionality = new Functionality();
          functionality.showCaptureButton = true;
          DocumentReader.setFunctionality(
            functionality,
            () => {},
            () => {},
          );
          updateState({fullName: 'Ready to Scan', isLoading: false});
        },
        error => {
          console.log(error);
          updateState({fullName: 'Failed to Initialize', isLoading: false});
        },
      );
    } catch (error) {
      console.log(error);
      updateState({fullName: 'Failed to Initialize', isLoading: false});
    }
  }, [updateState]);

  // Handle completion of document reading
  const handleCompletion = useCallback(
    (completion: DocumentReaderCompletion) => {
      if (state.isReadingRfidCustomUi) {
        if (completion.action === Enum.DocReaderAction.ERROR) {
          restartRfidUI();
        }
        if (
          actionSuccess(completion.action!) ||
          actionError(completion.action!)
        ) {
          hideRfidUI();
          displayResults(completion.results!);
        }
      } else if (
        actionSuccess(completion.action!) ||
        actionError(completion.action!)
      ) {
        handleResults(completion.results!);
      }
    },
    [state.isReadingRfidCustomUi],
  );

  const actionSuccess = (action: number) => {
    return (
      action === Enum.DocReaderAction.COMPLETE ||
      action === Enum.DocReaderAction.TIMEOUT
    );
  };

  const actionError = (action: number) => {
    return (
      action === Enum.DocReaderAction.CANCEL ||
      action === Enum.DocReaderAction.ERROR
    );
  };

  // RFID UI management
  // const showRfidUI = () => {
  //   updateState({isReadingRfidCustomUi: true});
  // };

  const hideRfidUI = () => {
    DocumentReader.stopRFIDReader(
      () => {},
      () => {},
    );
    restartRfidUI();
    updateState({
      isReadingRfidCustomUi: false,
      rfidUIHeader: 'Reading RFID',
      rfidUIHeaderColor: '#333',
    });
  };

  const restartRfidUI = () => {
    updateState({
      rfidUIHeaderColor: '#dc3545',
      rfidUIHeader: 'Failed!',
      rfidDescription: 'Place your phone on top of the NFC tag',
      rfidProgress: -1,
    });
  };

  const updateRfidUI = useCallback(
    (notification: DocumentReaderNotification) => {
      if (
        notification.notificationCode ===
        Enum.eRFID_NotificationCodes.RFID_NOTIFICATION_PCSC_READING_DATAGROUP
      ) {
        updateState({
          rfidDescription: `Reading Data: ${notification.dataFileType}`,
        });
      }
      updateState({rfidUIHeader: 'Reading RFID', rfidUIHeaderColor: '#333'});
      if (notification.progress != null) {
        updateState({rfidProgress: notification.progress / 100});
      }
      if (Platform.OS === 'ios') {
        DocumentReader.setRfidSessionStatus(
          `${state.rfidDescription}\n${notification.progress}%`,
          () => {},
          () => {},
        );
      }
    },
    [state.rfidDescription, updateState],
  );

  // Clear previous results
  const clearResults = () => {
    updateState({
      fullName: 'Ready to Scan',
      docFront: require('./images/id.png'),
      portrait: require('./images/portrait.png'),
      isAuthentic: null,
      authenticityMessage: '',
    });
  };

  // Scan document
  const scan = () => {
    clearResults();
    updateState({isLoading: true});
    const config = new ScannerConfig();
    config.scenario = state.selectedScenario;
    DocumentReader.scan(
      config,
      () => {},
      e => {
        console.log(e);
        updateState({isLoading: false});
      },
    );
  };

  // Recognize image from gallery
  const recognize = () => {
    launchImageLibrary(
      {mediaType: 'photo', includeBase64: true, selectionLimit: 10},
      response => {
        if (response.errorCode) {
          updateState({
            fullName: response.errorMessage || 'Error selecting image',
            isLoading: false,
          });
          return;
        }
        if (response.didCancel) {
          return;
        }

        clearResults();
        updateState({fullName: 'Processing Image...', isLoading: true});
        const images = response.assets?.map(asset => asset.base64!) || [];
        const config = new RecognizeConfig();
        config.scenario = state.selectedScenario;
        config.images = images;
        DocumentReader.recognize(
          config,
          () => {},
          e => {
            console.log(e);
            updateState({isLoading: false});
          },
        );
      },
    );
  };

  // Display results from scanning with authenticity check
  const displayResults = (results: DocumentReaderResults) => {
    if (!results) {
      updateState({isLoading: false});
      return;
    }

    // Extract full name
    results.textFieldValueByType(
      Enum.eVisualFieldType.FT_SURNAME_AND_GIVEN_NAMES,
      (value: string | undefined) => {
        updateState({fullName: value || 'Name not found'});
      },
      (error: string) => console.log(error),
    );

    // Extract document image
    results.graphicFieldImageByType(
      Enum.eGraphicFieldType.GF_DOCUMENT_IMAGE,
      (value: string | undefined) => {
        if (value) {
          updateState({docFront: {uri: `data:image/png;base64,${value}`}});
        }
      },
      (error: string) => console.log(error),
    );

    // Extract portrait
    results.graphicFieldImageByType(
      Enum.eGraphicFieldType.GF_PORTRAIT,
      (value: string | undefined) => {
        if (value) {
          updateState({portrait: {uri: `data:image/png;base64,${value}`}});
        }
      },
      (error: string) => console.log(error),
    );

    // Check authenticity
    const authenticityResults = results.authenticityResult;
    let isAuthentic = true;
    let authenticityMessage = 'Authenticity verified';

    if (authenticityResults) {
      const securityFeatures = authenticityResults.checks || [];
      isAuthentic = securityFeatures.every(
        (feature: any) => feature.status === 1,
      ); // 1 indicates pass
      authenticityMessage = isAuthentic
        ? 'Document is authentic'
        : 'Document authenticity check failed';
    } else {
      authenticityMessage = 'Authenticity check unavailable';
    }

    updateState({
      isAuthentic,
      authenticityMessage,
      isLoading: false,
    });
  };

  // RFID handling
  // const customRFID = () => {
  //   showRfidUI();
  //   DocumentReader.readRFID(
  //     false,
  //     false,
  //     false,
  //     () => {},
  //     () => {},
  //   );
  // };

  const usualRFID = () => {
    setIsReadingRfid(true);
    DocumentReader.startRFIDReader(
      false,
      false,
      false,
      () => {},
      () => {},
    );
  };

  const handleResults = (results: DocumentReaderResults) => {
    if (state.doRfid && !isReadingRfid && results?.chipPage !== 0) {
      usualRFID();
    } else {
      setIsReadingRfid(false);
      displayResults(results);
    }
  };

  // Effect for initialization and event listeners
  useEffect(() => {
    Icon.loadFont();
    const eventManager = new NativeEventEmitter(RNRegulaDocumentReader);
    const completionListener = eventManager.addListener('completion', e =>
      handleCompletion(DocumentReaderCompletion.fromJson(JSON.parse(e.msg))!),
    );
    const rfidListener = eventManager.addListener(
      'rfidOnProgressCompletion',
      e =>
        updateRfidUI(DocumentReaderNotification.fromJson(JSON.parse(e.msg))!),
    );

    initializeReader();

    return () => {
      completionListener.remove();
      rfidListener.remove();
    };
  }, [initializeReader, handleCompletion, updateRfidUI]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {!state.isReadingRfidCustomUi ? (
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{state.fullName}</Text>
            {state.isAuthentic !== null && (
              <View
                style={[
                  styles.authenticityBadge,
                  state.isAuthentic ? styles.authentic : styles.notAuthentic,
                ]}>
                <Text style={styles.authenticityText}>
                  {state.authenticityMessage}
                </Text>
              </View>
            )}
          </View>

          {/* Document and Portrait Images */}
          <View style={styles.imageContainer}>
            <View style={styles.imageCard}>
              <Text style={styles.imageLabel}>Portrait</Text>
              <Image
                style={styles.image}
                source={state.portrait}
                resizeMode="contain"
              />
            </View>
            <View style={styles.imageCard}>
              <Text style={styles.imageLabel}>Document</Text>
              <Image
                style={styles.image}
                source={state.docFront}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Scenario Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Select Scenario</Text>
            <RadioGroup
              containerStyle={styles.radioGroup}
              radioButtons={state.radioButtons}
              onPress={selectedID =>
                updateState({selectedScenario: selectedID})
              }
              selectedId={state.selectedScenario}
            />
          </View>

          {/* RFID Checkbox */}
          <View style={styles.section}>
            <Pressable
              style={styles.pressableContainer}
              onPress={() => {
                if (state.canRfid) {
                  updateState({doRfid: !state.doRfid});
                }
              }}
              disabled={!state.canRfid}>
              <View
                style={[
                  styles.toggleBox,
                  state.doRfid && styles.toggleBoxActive,
                ]}>
                {state.doRfid && <Icon name="check" size={16} color="#fff" />}
              </View>
              <Text
                style={[
                  styles.pressableText,
                  !state.canRfid && styles.disabledText,
                ]}>
                Process RFID Reading {state.canRfidTitle}
              </Text>
            </Pressable>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, state.isLoading && styles.buttonDisabled]}
              onPress={scan}
              disabled={state.isLoading}>
              {state.isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Scan Document</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, state.isLoading && styles.buttonDisabled]}
              onPress={recognize}
              disabled={state.isLoading}>
              {state.isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Scan Image</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.rfidContainer}>
          <Text style={[styles.rfidHeader, {color: state.rfidUIHeaderColor}]}>
            {state.rfidUIHeader}
          </Text>
          <Text style={styles.rfidDescription}>{state.rfidDescription}</Text>
          <Progress.Bar
            style={styles.progressBar}
            width={250}
            useNativeDriver
            color="#007AFF"
            progress={state.rfidProgress}
          />
          <TouchableOpacity style={styles.cancelButton} onPress={hideRfidUI}>
            <Icon name="times" size={24} color="#dc3545" />
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  authenticityBadge: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  authentic: {
    backgroundColor: '#28a745',
  },
  notAuthentic: {
    backgroundColor: '#dc3545',
  },
  authenticityText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  imageContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  imageCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  imageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  image: {
    height: 120,
    width: 120,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  radioGroup: {
    alignItems: 'flex-start',
  },
  checkbox: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    padding: 0,
  },
  checkboxText: {
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 150,
  },
  buttonDisabled: {
    backgroundColor: '#aaa',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  rfidContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  rfidHeader: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  rfidDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  progressBar: {
    marginBottom: 40,
  },
  cancelButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    padding: 10,
  },

  toggleBox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  toggleBoxActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  pressableContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pressableText: {
    fontSize: 16,
    color: '#333',
  },
  disabledText: {
    color: '#aaa',
  },
});

export default App;
