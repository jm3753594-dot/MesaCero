import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  IonBadge,
  IonButton,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

import {
  Capacitor,
  PluginListenerHandle
} from '@capacitor/core';

import { Preferences } from '@capacitor/preferences';

import {
  CapacitorNfc,
  NfcEvent,
  NdefRecord
} from '@capgo/capacitor-nfc';

import {
  BleClient,
  ScanResult
} from '@capacitor-community/bluetooth-le';

import { addIcons } from 'ionicons';

import {
  addOutline,
  bluetoothOutline,
  closeOutline,
  cubeOutline,
  trashOutline,
  wifiOutline
} from 'ionicons/icons';

interface Articulo {
  id: string;
  nombre: string;
  cantidad: number;
  conseguido: boolean;
}

interface DispositivoBle {
  id: string;
  nombre: string;
  rssi?: number;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonBadge,
    IonButton,
    IonCheckbox,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonTitle,
    IonToolbar
  ]
})
export class HomePage implements OnInit, OnDestroy {

  nombreLista = 'Materiales de Historia';

  nuevoArticulo = '';
  nuevaCantidad: number | null = null;

  mostrarFormulario = false;

  estadoConexion = 'Sin conexión cercana';
  mensajeSistema = '';

  articulos: Articulo[] = [];

  dispositivosBle: DispositivoBle[] = [];

  private lectorNfc:
    PluginListenerHandle | null = null;

  private escaneoNfcActivo = false;
  private escaneoBleActivo = false;

  private readonly CLAVE_ARTICULOS =
    'mesacero_articulos';

  private readonly IDENTIFICADOR_EQUIPO =
    'mesacero://equipo/E';

  private readonly articulosIniciales: Articulo[] = [
    {
      id: '1',
      nombre: 'Cartulina',
      cantidad: 3,
      conseguido: false
    },
    {
      id: '2',
      nombre: 'Marcadores',
      cantidad: 2,
      conseguido: true
    },
    {
      id: '3',
      nombre: 'Pegamento',
      cantidad: 1,
      conseguido: false
    },
    {
      id: '4',
      nombre: 'Cinta adhesiva',
      cantidad: 1,
      conseguido: false
    }
  ];

  constructor(
    private readonly cdr: ChangeDetectorRef
  ) {
    addIcons({
      addOutline,
      bluetoothOutline,
      closeOutline,
      cubeOutline,
      trashOutline,
      wifiOutline
    });
  }

  async ngOnInit(): Promise<void> {
    await this.cargarArticulos();
  }

  async ngOnDestroy(): Promise<void> {
    await this.detenerEscaneoNfc();
    await this.detenerEscaneoBle();
  }

  abrirFormulario(): void {
    this.mostrarFormulario = true;
    this.mensajeSistema = '';
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.nuevoArticulo = '';
    this.nuevaCantidad = null;
    this.mensajeSistema = '';
  }

  async agregarArticulo(): Promise<void> {
    const nombre = this.nuevoArticulo.trim();
    const cantidad = Number(this.nuevaCantidad);

    if (
      !nombre ||
      !Number.isInteger(cantidad) ||
      cantidad <= 0
    ) {
      this.mensajeSistema =
        'Escribe un nombre y una cantidad mayor que 0.';
      return;
    }

    const articulo: Articulo = {
      id: this.crearId(),
      nombre,
      cantidad,
      conseguido: false
    };

    this.articulos.push(articulo);
    await this.guardarArticulos();

    // Limpiar el formulario después de guardar.
    this.nuevoArticulo = '';
    this.nuevaCantidad = null;
    this.mostrarFormulario = false;

    this.mensajeSistema =
      'Artículo agregado y guardado correctamente.';

    this.cdr.detectChanges();
  }

  async cambiarEstado(
    articulo: Articulo
  ): Promise<void> {
    articulo.conseguido = !articulo.conseguido;
    await this.guardarArticulos();

    this.mensajeSistema =
      articulo.conseguido
        ? `${articulo.nombre} marcado como conseguido.`
        : `${articulo.nombre} marcado como pendiente.`;
  }

  async eliminarArticulo(
    id: string
  ): Promise<void> {
    const articulo =
      this.articulos.find(
        elemento => elemento.id === id
      );

    this.articulos =
      this.articulos.filter(
        elemento => elemento.id !== id
      );

    await this.guardarArticulos();

    if (articulo) {
      this.mensajeSistema =
        `${articulo.nombre} fue eliminado.`;
    }
  }

  async compartirCerca(): Promise<void> {
    this.actualizarEstadoConexion(
      'Comprobando Bluetooth LE...'
    );

    this.actualizarMensaje(
      'Preparando búsqueda de dispositivos BLE cercanos...'
    );

    try {
      if (!Capacitor.isNativePlatform()) {
        this.actualizarEstadoConexion(
          'Bluetooth LE requiere un dispositivo móvil'
        );

        this.actualizarMensaje(
          'El escaneo BLE debe realizarse desde la aplicación instalada en Android.'
        );

        return;
      }

      await this.detenerEscaneoBle();

      await BleClient.initialize({
        androidNeverForLocation: true
      });

      const bluetoothActivado =
        await BleClient.isEnabled();

      if (!bluetoothActivado) {
        this.actualizarEstadoConexion(
          'Bluetooth desactivado'
        );

        this.actualizarMensaje(
          'Bluetooth está desactivado. Solicitud de activación enviada...'
        );

        await BleClient.requestEnable();

        const bluetoothActivadoDespues =
          await BleClient.isEnabled();

        if (!bluetoothActivadoDespues) {
          this.actualizarEstadoConexion(
            'Bluetooth desactivado'
          );

          this.actualizarMensaje(
            'Es necesario activar Bluetooth para buscar dispositivos cercanos.'
          );

          return;
        }
      }

      this.dispositivosBle = [];

      this.actualizarEstadoConexion(
        'Buscando dispositivos BLE cercanos...'
      );

      this.actualizarMensaje(
        'Escaneo Bluetooth LE iniciado. Espera unos segundos...'
      );

      await BleClient.requestLEScan(
        {
          allowDuplicates: false
        },
        (resultado: ScanResult) => {
          this.registrarDispositivoBle(resultado);
        }
      );

      this.escaneoBleActivo = true;

      await this.esperar(8000);

      await this.detenerEscaneoBle();

      const cantidad =
        this.dispositivosBle.length;

      if (cantidad === 0) {
        this.actualizarEstadoConexion(
          'Bluetooth LE disponible'
        );

        this.actualizarMensaje(
          'Escaneo BLE finalizado. No se detectaron dispositivos BLE cercanos durante la búsqueda.'
        );

        return;
      }

      this.actualizarEstadoConexion(
        `${cantidad} dispositivo(s) BLE detectado(s)`
      );

      const nombres =
        this.dispositivosBle
          .slice(0, 5)
          .map(
            dispositivo =>
              dispositivo.nombre
          )
          .join(', ');

      this.actualizarMensaje(
        `Escaneo BLE finalizado. Se detectaron ${cantidad} dispositivo(s): ${nombres}.`
      );

      console.log(
        'Dispositivos BLE encontrados:',
        this.dispositivosBle
      );

    } catch (error) {
      console.error(
        'Error durante el escaneo BLE:',
        error
      );

      await this.detenerEscaneoBle();

      this.actualizarEstadoConexion(
        'Bluetooth LE no disponible'
      );

      this.actualizarMensaje(
        'No fue posible realizar el escaneo Bluetooth LE. Revisa los permisos y el estado de Bluetooth.'
      );
    }
  }

  private registrarDispositivoBle(
    resultado: ScanResult
  ): void {
    const id =
      resultado.device.deviceId;

    const existente =
      this.dispositivosBle.find(
        dispositivo =>
          dispositivo.id === id
      );

    if (existente) {
      if (
        resultado.rssi !== undefined
      ) {
        existente.rssi =
          resultado.rssi;
      }

      return;
    }

    const nombre =
      resultado.localName ||
      resultado.device.name ||
      'Dispositivo sin nombre';

    this.dispositivosBle.push({
      id,
      nombre,
      rssi: resultado.rssi
    });

    console.log(
      'Dispositivo BLE detectado:',
      {
        id,
        nombre,
        rssi: resultado.rssi
      }
    );

    this.actualizarEstadoConexion(
      `${this.dispositivosBle.length} dispositivo(s) BLE detectado(s)`
    );

    this.actualizarMensaje(
      `Buscando dispositivos cercanos... Encontrados: ${this.dispositivosBle.length}`
    );
  }

  private async detenerEscaneoBle():
    Promise<void> {
    try {
      if (this.escaneoBleActivo) {
        await BleClient.stopLEScan();
        this.escaneoBleActivo = false;
      }
    } catch (error) {
      console.error(
        'Error al detener el escaneo BLE:',
        error
      );

      this.escaneoBleActivo = false;
    }
  }

  private esperar(
    milisegundos: number
  ): Promise<void> {
    return new Promise(
      resolve =>
        setTimeout(
          resolve,
          milisegundos
        )
    );
  }

  async leerEtiquetaNfc(): Promise<void> {
    this.actualizarMensaje(
      'Comprobando NFC...'
    );

    try {
      if (!Capacitor.isNativePlatform()) {
        this.actualizarMensaje(
          'La lectura NFC debe realizarse en un dispositivo Android.'
        );
        return;
      }

      const soporte =
        await CapacitorNfc.isSupported();

      if (!soporte.supported) {
        this.actualizarMensaje(
          'Este dispositivo no dispone de tecnología NFC.'
        );
        return;
      }

      const resultadoEstado =
        await CapacitorNfc.getStatus();

      const status =
        resultadoEstado.status;

      if (status === 'NFC_DISABLED') {
        this.actualizarMensaje(
          'El dispositivo tiene NFC, pero está desactivado. Actívalo para continuar.'
        );
        return;
      }

      if (status === 'NO_NFC') {
        this.actualizarMensaje(
          'Este dispositivo no dispone de tecnología NFC.'
        );
        return;
      }

      if (status !== 'NFC_OK') {
        this.actualizarMensaje(
          `No se puede iniciar la lectura NFC. Estado: ${status}`
        );
        return;
      }

      await this.detenerEscaneoNfc();

      this.lectorNfc =
        await CapacitorNfc.addListener(
          'nfcEvent',
          (evento: NfcEvent) => {
            void this.procesarEventoNfc(evento);
          }
        );

      await CapacitorNfc.startScanning();

      this.escaneoNfcActivo = true;

      this.actualizarMensaje(
        'NFC listo. Acerca una etiqueta NFC a la parte posterior del dispositivo...'
      );

    } catch (error) {
      console.error(
        'Error al iniciar la lectura NFC:',
        error
      );

      this.actualizarMensaje(
        'Ocurrió un error al iniciar la lectura NFC.'
      );
    }
  }

  private async procesarEventoNfc(
    evento: NfcEvent
  ): Promise<void> {
    console.log(
      'Etiqueta NFC detectada:',
      evento
    );

    const registros =
      evento.tag.ndefMessage;

    if (
      !registros ||
      registros.length === 0
    ) {
      this.actualizarMensaje(
        'Se detectó una etiqueta NFC, pero no contiene información NDEF.'
      );

      await this.detenerEscaneoNfc();
      return;
    }

    const contenidos =
      registros
        .map(
          registro =>
            this.leerRegistroNdef(registro)
        )
        .filter(
          contenido =>
            contenido.length > 0
        );

    if (contenidos.length === 0) {
      this.actualizarMensaje(
        'Se detectó la etiqueta NFC, pero no fue posible interpretar su contenido.'
      );

      await this.detenerEscaneoNfc();
      return;
    }

    const contenidoCompleto =
      contenidos.join(' | ');

    console.log(
      'Contenido NFC:',
      contenidoCompleto
    );

    const perteneceEquipoE =
      contenidos.some(
        contenido =>
          contenido.includes(
            this.IDENTIFICADOR_EQUIPO
          )
      );

    if (perteneceEquipoE) {
      this.estadoConexion =
        'Equipo E identificado mediante NFC';

      this.actualizarMensaje(
        'Etiqueta NFC del Equipo E reconocida correctamente.'
      );
    } else {
      this.actualizarMensaje(
        `Etiqueta NFC leída: ${contenidoCompleto}`
      );
    }

    await this.detenerEscaneoNfc();
  }

  private leerRegistroNdef(
    registro: NdefRecord
  ): string {
    try {
      const tipo =
        String.fromCharCode(
          ...registro.type
        );

      const payload =
        new Uint8Array(
          registro.payload
        );

      if (
        registro.tnf === 1 &&
        tipo === 'T' &&
        payload.length > 0
      ) {
        const longitudIdioma =
          payload[0] & 0x3f;

        const datosTexto =
          payload.slice(
            1 + longitudIdioma
          );

        return new TextDecoder(
          'utf-8'
        ).decode(datosTexto);
      }

      if (
        registro.tnf === 1 &&
        tipo === 'U' &&
        payload.length > 0
      ) {
        const prefijo =
          this.obtenerPrefijoUri(
            payload[0]
          );

        const restoUri =
          new TextDecoder(
            'utf-8'
          ).decode(
            payload.slice(1)
          );

        return `${prefijo}${restoUri}`;
      }

      return new TextDecoder(
        'utf-8'
      ).decode(payload);

    } catch (error) {
      console.error(
        'Error al interpretar registro NDEF:',
        error
      );
      return '';
    }
  }

  private obtenerPrefijoUri(
    codigo: number
  ): string {
    const prefijos: Record<number, string> = {
      0x00: '',
      0x01: 'http://www.',
      0x02: 'https://www.',
      0x03: 'http://',
      0x04: 'https://',
      0x05: 'tel:',
      0x06: 'mailto:',
      0x07: 'ftp://anonymous:anonymous@',
      0x08: 'ftp://ftp.',
      0x09: 'ftps://',
      0x0A: 'sftp://',
      0x0B: 'smb://',
      0x0C: 'nfs://',
      0x0D: 'ftp://',
      0x0E: 'dav://',
      0x0F: 'news:',
      0x10: 'telnet://',
      0x11: 'imap:',
      0x12: 'rtsp://',
      0x13: 'urn:',
      0x14: 'pop:',
      0x15: 'sip:',
      0x16: 'sips:',
      0x17: 'tftp:',
      0x18: 'btspp://',
      0x19: 'btl2cap://',
      0x1A: 'btgoep://',
      0x1B: 'tcpobex://',
      0x1C: 'irdaobex://',
      0x1D: 'file://',
      0x1E: 'urn:epc:id:',
      0x1F: 'urn:epc:tag:',
      0x20: 'urn:epc:pat:',
      0x21: 'urn:epc:raw:',
      0x22: 'urn:epc:',
      0x23: 'urn:nfc:'
    };

    return prefijos[codigo] ?? '';
  }

  private async detenerEscaneoNfc():
    Promise<void> {
    try {
      if (this.escaneoNfcActivo) {
        await CapacitorNfc.stopScanning();
        this.escaneoNfcActivo = false;
      }

      if (this.lectorNfc) {
        await this.lectorNfc.remove();
        this.lectorNfc = null;
      }

    } catch (error) {
      console.error(
        'Error al detener el escaneo NFC:',
        error
      );
    }
  }

  private actualizarMensaje(
    mensaje: string
  ): void {
    this.mensajeSistema = mensaje;
    this.cdr.detectChanges();
  }

  private actualizarEstadoConexion(
    estado: string
  ): void {
    this.estadoConexion = estado;
    this.cdr.detectChanges();
  }

  private async guardarArticulos():
    Promise<void> {
    try {
      await Preferences.set({
        key: this.CLAVE_ARTICULOS,
        value: JSON.stringify(
          this.articulos
        )
      });
    } catch (error) {
      console.error(
        'Error al guardar los artículos:',
        error
      );

      this.mensajeSistema =
        'No se pudieron guardar los cambios.';
    }
  }

  private async cargarArticulos():
    Promise<void> {
    try {
      const resultado =
        await Preferences.get({
          key: this.CLAVE_ARTICULOS
        });

      if (resultado.value) {
        this.articulos =
          JSON.parse(
            resultado.value
          );
      } else {
        this.articulos =
          this.articulosIniciales.map(
            articulo => ({
              ...articulo
            })
          );

        await this.guardarArticulos();
      }

    } catch (error) {
      console.error(
        'Error al cargar los artículos:',
        error
      );

      this.articulos =
        this.articulosIniciales.map(
          articulo => ({
            ...articulo
          })
        );

      this.mensajeSistema =
        'No se pudieron recuperar los datos guardados.';
    }
  }

  private crearId(): string {
    if (
      typeof crypto !== 'undefined' &&
      typeof crypto.randomUUID ===
        'function'
    ) {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()}`;
  }
}