import { toast } from 'react-toastify';

export async function fetchJson<JSON = unknown>(
  url: RequestInfo,
  init?: RequestInit
): Promise<JSON> {
  return fetch(url, {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    credentials: 'include',
    ...init,
  })
    .then((res) => {
      if (!res.ok) {
        return Promise.reject({ message: res.statusText });
      }

      return res.json();
    })
    .catch((err) => {
      console.log('-------------> ERR: ', err);
      toast.error(err.message);
      return Promise.reject({ message: err.message });
    });
}
