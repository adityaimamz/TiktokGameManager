import { describe, expect, it } from 'vitest'
import { lanUrls } from './lan-urls.js'
import type { NetworkInterfaceInfo } from 'node:os'

const ipv4 = (address: string, internal: boolean): NetworkInterfaceInfo =>
  ({
    address,
    family: 'IPv4',
    internal,
    netmask: '255.255.255.0',
    mac: '00:00:00:00:00:00',
  }) as NetworkInterfaceInfo

const ipv6 = (address: string): NetworkInterfaceInfo =>
  ({
    address,
    family: 'IPv6',
    internal: false,
    netmask: 'ffff::',
    mac: '00:00:00:00:00:00',
    scopeid: 0,
  }) as NetworkInterfaceInfo

describe('lanUrls', () => {
  it('mengubah tiap IPv4 non-internal jadi URL berport', () => {
    const urls = lanUrls(3001, () => ({
      'Wi-Fi': [ipv4('192.168.1.5', false)],
      Ethernet: [ipv4('10.0.0.7', false)],
    }))

    expect(urls).toEqual(['http://192.168.1.5:3001', 'http://10.0.0.7:3001'])
  })

  it('menyaring loopback dan IPv6 — keduanya tidak menolong device lain', () => {
    const urls = lanUrls(3001, () => ({
      Loopback: [ipv4('127.0.0.1', true)],
      'Wi-Fi': [ipv4('192.168.1.5', false), ipv6('fe80::1')],
    }))

    expect(urls).toEqual(['http://192.168.1.5:3001'])
  })

  it('menjawab daftar kosong saat tidak ada antarmuka sama sekali', () => {
    expect(lanUrls(3001, () => ({}))).toEqual([])
    expect(lanUrls(3001, () => ({ Kosong: undefined }))).toEqual([])
  })
})
